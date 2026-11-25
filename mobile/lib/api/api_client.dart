import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import 'token_store.dart';

/// Which of the website's two session cookies a request is made with.
enum Session { none, customer, staff }

class ApiException implements Exception {
  ApiException(this.message, {this.status = 0, this.code, this.body = const {}});

  /// Safe to show to the person: either the server's own `error` text or a plain network message.
  final String message;
  final int status;
  final String? code;
  final Map<String, dynamic> body;

  @override
  String toString() => message;
}

/// Talks to the website's JSON API. The site signs people in with HttpOnly cookies, so the app keeps the cookie
/// value itself and sends it back. State-changing requests carry the site's own Origin, which the staff routes
/// require. (In a browser build the browser does both of these, so the app leaves them alone.)
class ApiClient {
  ApiClient({
    required String baseUrl,
    required this.tokens,
    http.Client? client,
    this.isWeb = kIsWeb,
    this.timeout = const Duration(seconds: 25),
    this.retryDelays = const [Duration(milliseconds: 400), Duration(milliseconds: 1500)],
  })  : base = Uri.parse(baseUrl),
        _http = client ?? http.Client();

  static const customerCookie = 'hbt_session';
  static const staffCookie = 'hbt_staff';

  final Uri base;
  final TokenStore tokens;
  final http.Client _http;
  final bool isWeb;
  final Duration timeout;

  /// Pauses before a failed read is tried again. Writes are never repeated.
  final List<Duration> retryDelays;

  String get origin => '${base.scheme}://${base.authority}';

  Uri url(String path, [Map<String, String>? query]) {
    final u = base.resolve(path);
    if (query == null || query.isEmpty) return u;
    return u.replace(queryParameters: {...u.queryParameters, ...query});
  }

  static String? _cookieName(Session s) => switch (s) {
        Session.customer => customerCookie,
        Session.staff => staffCookie,
        Session.none => null,
      };

  Future<bool> hasSession(Session s) async {
    if (isWeb) return true; // the browser holds the cookie; only the server knows
    final name = _cookieName(s);
    return name != null && await tokens.read(name) != null;
  }

  Future<void> forget(Session s) async {
    final name = _cookieName(s);
    if (name != null) await tokens.delete(name);
  }

  Future<Map<String, String>> authHeaders(Session session) async {
    final name = _cookieName(session);
    if (isWeb || name == null) return {};
    final token = await tokens.read(name);
    return token == null ? {} : {'Cookie': '$name=$token'};
  }

  Future<Map<String, dynamic>> get(String path, {Session session = Session.none, Map<String, String>? query}) =>
      _json('GET', path, session: session, query: query);

  Future<Map<String, dynamic>> post(String path, {Session session = Session.none, Object? body}) =>
      _json('POST', path, session: session, body: body);

  Future<Map<String, dynamic>> patch(String path, {Session session = Session.none, Object? body}) =>
      _json('PATCH', path, session: session, body: body);

  Future<Map<String, dynamic>> put(String path, {Session session = Session.none, Object? body}) =>
      _json('PUT', path, session: session, body: body);

  Future<Map<String, dynamic>> delete(String path, {Session session = Session.none, Object? body}) =>
      _json('DELETE', path, session: session, body: body);

  Future<Map<String, dynamic>> uploadImage(
    String path,
    Uint8List bytes, {
    required String filename,
    Session session = Session.customer,
  }) =>
      upload(path, bytes, filename: filename, type: imageType(bytes), session: session);

  /// A file sent as a form, with any extra [fields].
  Future<Map<String, dynamic>> upload(
    String path,
    Uint8List bytes, {
    required String filename,
    required MediaType type,
    Map<String, String> fields = const {},
    Session session = Session.staff,
  }) async {
    final request = http.MultipartRequest('POST', url(path));
    request.headers.addAll(await authHeaders(session));
    if (!isWeb) request.headers['Origin'] = origin;
    request.fields.addAll(fields);
    request.files.add(http.MultipartFile.fromBytes('file', bytes, filename: filename, contentType: type));
    return _decode(await _send(request, limit: const Duration(seconds: 90)));
  }

  /// Sends a large file straight to storage through the one-off link the website gave. No sign-in is sent there.
  Future<void> putToStorage(Uri link, Uint8List bytes, String contentType) async {
    final request = http.Request('PUT', link)
      ..headers['Content-Type'] = contentType
      ..bodyBytes = bytes;
    final res = await _send(request, limit: const Duration(minutes: 3));
    if (res.statusCode < 200 || res.statusCode >= 300) throw ApiException('The upload to storage failed.', status: res.statusCode);
  }

  /// A file to save (report, receipt, backup) and the name the server suggests.
  Future<(Uint8List, String)> download(String path,
      {Session session = Session.staff, Map<String, String>? query, String fallbackName = 'download'}) async {
    final request = http.Request('GET', url(path, query))..followRedirects = false;
    request.headers.addAll(await authHeaders(session));
    var res = await _send(request, limit: const Duration(seconds: 90));
    // A large file is served by storage itself: follow the link without the sign-in cookie.
    final location = res.headers['location'];
    if (res.statusCode >= 300 && res.statusCode < 400 && location != null) {
      res = await _send(http.Request('GET', request.url.resolve(location)), limit: const Duration(minutes: 3));
    }
    if (res.statusCode != 200) {
      _decode(res); // throws with the server's own message
      throw ApiException('The file could not be downloaded.', status: res.statusCode);
    }
    final named = RegExp('filename="([^"]+)"').firstMatch(res.headers['content-disposition'] ?? '');
    return (res.bodyBytes, named?.group(1) ?? fallbackName);
  }

  /// A private file, such as a payment screenshot, fetched with the session cookie.
  Future<Uint8List> getBytes(String path, {Session session = Session.none}) async {
    final headers = await authHeaders(session);
    final res = await _read(() => http.Request('GET', url(path))..headers.addAll(headers));
    if (res.statusCode != 200) throw ApiException('Could not load the file.', status: res.statusCode);
    return res.bodyBytes;
  }

  /// The menu PDF the shop has published, and the file name the server suggests. Printing it after a quiet spell
  /// can take a while, so it is given longer than other requests.
  Future<(Uint8List, String)> downloadMenuPdf() async {
    final res = await _send(http.Request('GET', url('/api/menu/pdf')), limit: const Duration(seconds: 75));
    if (res.statusCode != 200) {
      _decode(res); // throws with the server's own message
      throw ApiException('The menu could not be downloaded.', status: res.statusCode);
    }
    final bytes = res.bodyBytes;
    if (bytes.length < 5 || String.fromCharCodes(bytes.sublist(0, 5)) != '%PDF-') {
      throw ApiException('The menu could not be downloaded. Please try again.', status: res.statusCode);
    }
    final named = RegExp('filename="([^"]+)"').firstMatch(res.headers['content-disposition'] ?? '');
    return (bytes, named?.group(1) ?? 'Menu.pdf');
  }

  static MediaType imageType(Uint8List b) {
    if (b.length > 8 && b[0] == 0x89 && b[1] == 0x50) return MediaType('image', 'png');
    if (b.length > 12 && b[0] == 0x52 && b[8] == 0x57) return MediaType('image', 'webp');
    return MediaType('image', 'jpeg');
  }

  Future<Map<String, dynamic>> _json(
    String method,
    String path, {
    Session session = Session.none,
    Map<String, String>? query,
    Object? body,
  }) async {
    final auth = await authHeaders(session);
    http.Request build() {
      final request = http.Request(method, url(path, query));
      request.headers.addAll(auth);
      request.headers['Accept'] = 'application/json';
      if (!isWeb && method != 'GET') request.headers['Origin'] = origin;
      if (body != null) {
        request.headers['Content-Type'] = 'application/json';
        request.body = jsonEncode(body);
      }
      return request;
    }

    return _decode(method == 'GET' ? await _read(build) : await _send(build()));
  }

  /// A read that fails because the connection or the server hiccuped is tried again before anyone is told.
  Future<http.Response> _read(http.BaseRequest Function() build) async {
    for (var attempt = 0;; attempt++) {
      final last = attempt >= retryDelays.length;
      try {
        final res = await _send(build());
        if (last || !const [500, 502, 503, 504].contains(res.statusCode)) return res;
      } on ApiException {
        if (last) rethrow;
      }
      await Future<void>.delayed(retryDelays[attempt]);
    }
  }

  Future<http.Response> _send(http.BaseRequest request, {Duration? limit}) async {
    try {
      final streamed = await _http.send(request).timeout(limit ?? timeout);
      final res = await http.Response.fromStream(streamed).timeout(limit ?? timeout);
      await _storeCookies(res);
      return res;
    } on TimeoutException {
      throw ApiException('The server took too long to answer. Please try again.');
    } on Exception {
      throw ApiException('Network problem. Please check your connection and try again.');
    }
  }

  Future<void> _storeCookies(http.Response res) async {
    final header = res.headers['set-cookie'];
    if (isWeb || header == null) return;
    // Several cookies arrive joined by commas, and "Expires=Thu, 01 Jan..." contains commas too, so match by name.
    final pattern = RegExp('(?:^|,)\\s*($customerCookie|$staffCookie)=([^;,]*)');
    for (final m in pattern.allMatches(header)) {
      final name = m.group(1)!;
      final value = m.group(2)!;
      if (value.isEmpty) {
        await tokens.delete(name);
      } else {
        await tokens.write(name, value);
      }
    }
  }

  Map<String, dynamic> _decode(http.Response res) {
    var json = <String, dynamic>{};
    try {
      final d = jsonDecode(utf8.decode(res.bodyBytes));
      if (d is Map<String, dynamic>) json = d;
    } catch (_) {}
    if (res.statusCode >= 200 && res.statusCode < 300) {
      if (json.isEmpty && res.bodyBytes.isNotEmpty && !res.body.trimLeft().startsWith('{')) {
        throw ApiException('The server sent an unexpected answer.', status: res.statusCode);
      }
      return json;
    }
    final fallback = res.statusCode == 413
        ? 'That image is too large. Please choose a smaller one.'
        : 'Something went wrong. Please try again.';
    throw ApiException(
      json['error']?.toString() ?? fallback,
      status: res.statusCode,
      code: json['code']?.toString(),
      body: json,
    );
  }
}
