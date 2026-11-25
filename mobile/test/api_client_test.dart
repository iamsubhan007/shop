import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:hbt_app/api/api_client.dart';
import 'package:hbt_app/api/token_store.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  late MemoryTokenStore tokens;
  late List<http.Request> seen;

  ApiClient client(http.Response Function(http.Request) answer) => ApiClient(
        baseUrl: 'https://shop.example',
        tokens: tokens,
        isWeb: false,
        client: MockClient((request) async {
          seen.add(request);
          return answer(request);
        }),
      );

  http.Response json(Object body, {int status = 200, String? cookie}) => http.Response(
        jsonEncode(body),
        status,
        headers: {'content-type': 'application/json', 'set-cookie': ?cookie},
      );

  setUp(() {
    tokens = MemoryTokenStore();
    seen = [];
  });

  test('keeps the session cookie from sign-in and sends it back on that session only', () async {
    final api = client((_) => json({'success': true}, cookie: 'hbt_session=abc123; Path=/; Expires=Thu, 24 Dec 2026 10:00:00 GMT; HttpOnly; Secure; SameSite=lax'));
    await api.post('/api/auth/otp/verify', body: {'email': 'a@b.co', 'code': '123456'});
    expect(tokens.values, {'hbt_session': 'abc123'});

    await api.get('/api/orders/mine', session: Session.customer);
    expect(seen.last.headers['Cookie'], 'hbt_session=abc123');

    await api.get('/api/menu');
    expect(seen.last.headers.containsKey('Cookie'), isFalse);

    await api.get('/api/admin/orders', session: Session.staff);
    expect(seen.last.headers.containsKey('Cookie'), isFalse);
  });

  test('sends the site origin on writes, which the staff routes require', () async {
    final api = client((_) => json({}));
    await api.patch('/api/admin/orders/1', session: Session.staff, body: {'action': 'status'});
    expect(seen.last.headers['Origin'], 'https://shop.example');
    await api.get('/api/menu');
    expect(seen.last.headers.containsKey('Origin'), isFalse);
  });

  test('a cleared cookie removes the saved session', () async {
    tokens.values['hbt_staff'] = 'old';
    tokens.values['hbt_session'] = 'keep';
    final api = client((_) => json({'success': true}, cookie: 'hbt_staff=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'));
    await api.post('/api/auth/logout', session: Session.staff, body: {'scope': 'staff'});
    expect(tokens.values, {'hbt_session': 'keep'});
  });

  test('shows the server\'s own error message and code', () async {
    final api = client((_) => json({'error': 'We are closed right now.', 'code': 'ordering_closed'}, status: 409));
    await expectLater(
      api.post('/api/checkout', session: Session.customer, body: {}),
      throwsA(isA<ApiException>()
          .having((e) => e.message, 'message', 'We are closed right now.')
          .having((e) => e.code, 'code', 'ordering_closed')
          .having((e) => e.status, 'status', 409)),
    );
  });

  test('a network failure becomes a readable message', () async {
    final api = ApiClient(
      baseUrl: 'https://shop.example',
      tokens: tokens,
      isWeb: false,
      client: MockClient((_) async => throw http.ClientException('no route')),
    );
    await expectLater(api.get('/api/menu'), throwsA(isA<ApiException>().having((e) => e.status, 'status', 0).having((e) => e.message, 'message', contains('Network problem'))));
  });

  test('a web page instead of JSON is an error, not an empty answer', () async {
    final api = client((_) => http.Response('<html>sign in to wifi</html>', 200));
    await expectLater(api.get('/api/menu'), throwsA(isA<ApiException>()));
  });

  test('picture type comes from the bytes', () {
    expect(ApiClient.imageType(Uint8List.fromList([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])).subtype, 'png');
    expect(ApiClient.imageType(Uint8List.fromList([0xff, 0xd8, 0xff, 0xe0])).subtype, 'jpeg');
  });

  test('picture paths with spaces are encoded', () {
    final api = client((_) => json({}));
    expect(api.url('/alooo nan.jpg').toString(), 'https://shop.example/alooo%20nan.jpg');
    expect(api.url('/_next/image', {'url': '/a b.jpg', 'w': '384'}).queryParameters['url'], '/a b.jpg');
  });
}
