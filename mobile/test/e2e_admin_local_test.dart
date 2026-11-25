/// The admin screens' requests against a LOCAL copy of the website, with the app's own API code: every list they
/// load, menu PDF upload, photo upload, receipt, reports, exports and backups. Refuses anything but localhost.
///
///   flutter test test/e2e_admin_local_test.dart --dart-define=E2E_BASE=http://localhost:3100 --dart-define=E2E_MAIL=http://127.0.0.1:2626
library;

import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:hbt_app/api/api_client.dart';
import 'package:hbt_app/api/token_store.dart';
import 'package:hbt_app/staff/admin/backup_report.dart';
import 'package:hbt_app/staff/staff_api.dart';
import 'package:hbt_app/state/auth_state.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:shared_preferences/shared_preferences.dart';

const base = String.fromEnvironment('E2E_BASE');
const mail = String.fromEnvironment('E2E_MAIL');
const ownerEmail = String.fromEnvironment('E2E_OWNER', defaultValue: 'owner@example.com');

final _png = base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhWpD4QAAAABJRU5ErkJggg==');

Future<String> codeFor(String email) async {
  for (var i = 0; i < 60; i++) {
    final res = await http.get(Uri.parse('$mail/code').replace(queryParameters: {'to': email}));
    if (res.statusCode == 200 && RegExp(r'^\d{6}$').hasMatch(res.body)) return res.body;
    await Future<void>.delayed(const Duration(milliseconds: 250));
  }
  throw StateError('no code arrived for $email');
}

bool isPdf(Uint8List b) => b.length > 100 && String.fromCharCodes(b.sublist(0, 5)) == '%PDF-';

void main() {
  final host = Uri.tryParse(base)?.host;
  final local = host == 'localhost' || host == '127.0.0.1';

  test('owner: every admin list, uploads, downloads and backups', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final client = ApiClient(baseUrl: base, tokens: MemoryTokenStore(), isWeb: false);
    final staff = StaffState(client, prefs);
    await staff.requestCode(ownerEmail);
    await staff.verifyCode(ownerEmail, await codeFor(ownerEmail));
    final api = StaffApi(client, staff);

    for (final path in [
      '/api/admin/stats', '/api/admin/products', '/api/admin/categories', '/api/admin/deals', '/api/admin/menu-pdf', '/api/admin/closing',
      '/api/admin/analytics', '/api/admin/coupons', '/api/admin/storage', '/api/admin/backups', '/api/admin/audit', '/api/admin/staff', '/api/admin/settings',
    ]) {
      await api.get(path);
    }
    await api.get('/api/admin/customers', query: {'q': ''});
    await api.get('/api/admin/storage/proofs', query: {'days': '30'});

    // photo upload
    final photo = await api.upload('/api/admin/upload', _png, filename: 'photo', type: ApiClient.imageType(_png));
    expect('${photo['url']}', startsWith('/api/files/product/'));

    // the automatic menu PDF, then upload one of our own (not published), read it back and delete it
    final (automatic, _) = await api.download('/api/admin/menu-pdf/preview');
    expect(isPdf(automatic), isTrue);
    final uploaded = await api.upload('/api/admin/menu-pdf', automatic, filename: 'app-test-menu.pdf', type: MediaType('application', 'pdf'), fields: {'activate': 'false'});
    final file = (uploaded['files'] as List).cast<Map<String, dynamic>>().firstWhere((f) => f['original'] == 'app-test-menu.pdf');
    expect(uploaded['source'], isNot('custom'));
    final (back, _) = await api.download('/api/admin/menu-pdf/files/${file['id']}');
    expect(back.length, automatic.length);
    await api.delete('/api/admin/menu-pdf/files/${file['id']}');

    // receipt, closing report and exports
    final orders = (await api.get('/api/admin/orders'))['orders'] as List;
    final (receipt, receiptName) = await api.download('/api/admin/orders/${(orders.first as Map)['id']}/receipt');
    expect(isPdf(receipt), isTrue, reason: receiptName);
    final (closing, _) = await api.download('/api/admin/closing', query: {'format': 'pdf'});
    expect(isPdf(closing), isTrue);
    for (final format in ['xlsx', 'csv', 'pdf']) {
      final (bytes, name) = await api.download('/api/admin/export', query: {'type': 'orders', 'format': format});
      expect(bytes, isNotEmpty);
      expect(name, endsWith('.$format'));
    }

    // back up now, download it and read a report from it on the phone
    final made = await api.post('/api/admin/backups', {});
    final (backup, backupName) = await api.download('/api/admin/backups/${(made['backup'] as Map)['id']}');
    expect(backupName, endsWith('.json.gz'));
    final data = readBackup(backup);
    final info = backupInfo(data);
    expect(info.orders, greaterThan(0));
    final report = buildReport(data, period: 'month', date: info.lastDay!);
    expect((report['summary'] as Map)['received'], greaterThan(0));

    await staff.signOut();
  }, skip: local ? false : 'set E2E_BASE to a local server to run', timeout: const Timeout(Duration(minutes: 5)));
}
