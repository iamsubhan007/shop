import 'dart:typed_data';

import 'package:flutter/widgets.dart';
import 'package:http_parser/http_parser.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../state/auth_state.dart';

/// API calls made with the staff session. A refusal makes the app check whether the session has ended.
class StaffApi {
  StaffApi(this.api, this.staff);

  factory StaffApi.of(BuildContext context) => StaffApi(context.read<ApiClient>(), context.read<StaffState>());

  final ApiClient api;
  final StaffState staff;

  static String _key(String path, Map<String, String>? query) => Uri(path: path, queryParameters: query).toString();

  /// The last answer to this request, if there was one since signing in.
  Map<String, dynamic>? peek(String path, {Map<String, String>? query}) => staff.cache[_key(path, query)];

  Future<Map<String, dynamic>> get(String path, {Map<String, String>? query}) async {
    final answer = await _guard(() => api.get(path, session: Session.staff, query: query));
    if (staff.user != null) staff.cache[_key(path, query)] = answer;
    return answer;
  }

  Future<Map<String, dynamic>> post(String path, Object body) =>
      _guard(() => api.post(path, session: Session.staff, body: body));

  Future<Map<String, dynamic>> put(String path, Object body) =>
      _guard(() => api.put(path, session: Session.staff, body: body));

  Future<Map<String, dynamic>> patch(String path, Object body) =>
      _guard(() => api.patch(path, session: Session.staff, body: body));

  Future<Map<String, dynamic>> delete(String path) => _guard(() => api.delete(path, session: Session.staff));

  Future<Map<String, dynamic>> upload(String path, Uint8List bytes,
          {required String filename, required MediaType type, Map<String, String> fields = const {}}) =>
      _guard(() => api.upload(path, bytes, filename: filename, type: type, fields: fields));

  Future<(Uint8List, String)> download(String path, {Map<String, String>? query, String fallbackName = 'download'}) =>
      _guard(() => api.download(path, query: query, fallbackName: fallbackName));

  Future<T> _guard<T>(Future<T> Function() run) async {
    try {
      return await run();
    } on ApiException catch (e) {
      if (e.status == 401 || e.status == 403) await staff.checkAfterRefusal();
      rethrow;
    }
  }
}
