// Retries, payment confirmation and reminders, the order timer with its rider, and the backup report.
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:hbt_app/api/api_client.dart';
import 'package:hbt_app/api/token_store.dart';
import 'package:hbt_app/models/order.dart';
import 'package:hbt_app/screens/order_detail_screen.dart';
import 'package:hbt_app/staff/admin/backup_report.dart';
import 'package:hbt_app/staff/admin_order_screen.dart';
import 'package:hbt_app/state/auth_state.dart';
import 'package:hbt_app/state/site_state.dart';
import 'package:hbt_app/theme.dart';
import 'package:hbt_app/utils/format.dart';
import 'package:hbt_app/utils/order_status.dart';
import 'package:hbt_app/widgets/order_progress.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fixtures.dart';

ApiClient client(Future<http.Response> Function(http.Request) answer, {List<Duration> retry = const [Duration.zero, Duration.zero]}) => ApiClient(
      baseUrl: 'https://shop.example',
      tokens: MemoryTokenStore()
        ..values['hbt_staff'] = 'tok'
        ..values['hbt_session'] = 'cust',
      isWeb: false,
      retryDelays: retry,
      client: MockClient(answer),
    );

Map<String, Object?> unpaid({String status = 'Payment Pending', String paymentStatus = 'pending', Map<String, Object?> extra = const {}}) => {
      'id': 'o1',
      'orderNumber': 'HBT-261126-001',
      'userId': 'c1',
      'orderType': 'delivery',
      'status': status,
      'paymentMethod': 'jazzcash',
      'paymentStatus': paymentStatus,
      'customerName': 'Ali',
      'customerPhone': '03001234567',
      'customerEmail': 'ali@example.com',
      'deliveryAddress': 'Test 1',
      'subtotal': 500,
      'discountAmount': 0,
      'deliveryFee': 0,
      'totalAmount': 500,
      'createdAt': '2026-11-26T10:00:00.000Z',
      'items': [
        {'id': 'l1', 'title': 'Nutella Naan', 'itemTitle': 'Nutella Naan', 'quantity': 1, 'unitPrice': 500, 'subtotal': 500, 'subtotalPrice': 500},
      ],
      'history': <Object>[],
      'payments': <Object>[],
      ...extra,
    };

http.Response json(Object body, [int status = 200]) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

Future<void> wide(WidgetTester tester) async {
  tester.view.physicalSize = const Size(360, 4000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

void main() {
  group('weak connections', () {
    test('a read is tried again until the server answers', () async {
      var calls = 0;
      final api = client((_) async => ++calls < 3 ? json({'error': 'busy'}, 503) : json({'ok': true}));
      expect(await api.get('/api/menu'), {'ok': true});
      expect(calls, 3);
    });

    test('a change is never sent twice', () async {
      var calls = 0;
      final api = client((_) async {
        calls++;
        return json({'error': 'busy'}, 503);
      });
      await expectLater(api.post('/api/checkout', body: {}), throwsA(isA<ApiException>()));
      await expectLater(api.patch('/api/admin/orders/1', body: {}), throwsA(isA<ApiException>()));
      expect(calls, 2);
    });

    test('a downloaded file follows the storage link without the sign-in', () async {
      final cookies = <String, String?>{};
      final api = client((request) async {
        cookies[request.url.host] = request.headers['Cookie'];
        return request.url.host == 'shop.example'
            ? http.Response('', 307, headers: {'location': 'https://storage.example/file'})
            : http.Response.bytes([1, 2, 3], 200);
      });
      final (bytes, name) = await api.download('/api/admin/backups/1', fallbackName: 'b.gz');
      expect(bytes, Uint8List.fromList([1, 2, 3]));
      expect(name, 'b.gz');
      expect(cookies, {'shop.example': 'hbt_staff=tok', 'storage.example': null});
    });
  });

  testWidgets('owner confirms without proof and reminds the customer', (tester) async {
    await wide(tester);
    SharedPreferences.setMockInitialValues({'staff_mode': true, 'staff_user': jsonEncode({'id': 's1', 'email': 'o@example.com', 'role': 'owner'})});
    final prefs = await SharedPreferences.getInstance();
    final changes = <Map<String, dynamic>>[];
    final api = client((request) async {
      if (request.method == 'PATCH') {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        changes.add(body);
        return json(body['action'] == 'remind_payment'
            ? {'success': true, 'email': 'sent', 'emailTo': 'ali@example.com', 'whatsappUrl': 'https://wa.me/923001234567?text=hi'}
            : {'success': true});
      }
      return json({'order': unpaid()});
    });
    await tester.pumpWidget(MultiProvider(
      providers: [Provider<ApiClient>.value(value: api), ChangeNotifierProvider(create: (_) => StaffState(api, prefs))],
      child: MaterialApp(theme: buildTheme(), home: const AdminOrderScreen(orderId: 'o1')),
    ));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));

    await tester.tap(find.text('Remind customer about payment'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('Send reminder'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.textContaining('Reminder emailed to ali@example.com'), findsOneWidget);
    expect(find.text('Send it on WhatsApp too'), findsOneWidget);

    await tester.tap(find.text('Payment received — confirm order'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('Confirm'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 400));

    expect(changes, [
      {'action': 'remind_payment'},
      {'action': 'payment', 'decision': 'manual'},
    ]);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('the customer sees the reminder and can add proof', (tester) async {
    await wide(tester);
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final api = client((request) async {
      if (request.url.path == '/api/auth/me') return json({'user': {'id': 'c1', 'email': 'ali@example.com', 'fullName': 'Ali', 'phone': '03001234567'}});
      if (request.url.path == '/api/settings') return json({...settingsJson, 'paymentInstructions': {'instructions': '', 'jazzcash': {'enabled': true, 'number': '03001112222', 'title': 'HBT'}}});
      return json({
        'order': unpaid(status: 'Payment Verification', paymentStatus: 'submitted', extra: {'paymentReminderAt': '2026-11-26T10:05:00.000Z', 'canSubmitPayment': true}),
      });
    });
    final auth = AuthState(api);
    await auth.load();
    await tester.pumpWidget(MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: api),
        ChangeNotifierProvider.value(value: auth),
        ChangeNotifierProvider(create: (_) => SiteState(api, prefs)),
      ],
      child: MaterialApp(theme: buildTheme(), home: const OrderDetailScreen(orderId: 'o1')),
    ));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.textContaining('We have not received your payment of Rs. 500 yet'), findsOneWidget);
    expect(find.text('Send proof of payment'), findsOneWidget);
    expect(find.text('Submit for verification'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  group('order timer and rider', () {
    test('stops, labels and countdown', () {
      expect(['Placed', 'Confirmed', 'Cooking', 'Ready for Pickup', 'Out for Delivery', 'Completed'].map(trackStage), [-1, 0, 1, 2, 2, 3]);
      expect(trackLabels('pickup'), ['Confirmed', 'Cooking', 'Ready to pick', 'Completed']);
      expect(trackLabels('delivery')[2], 'Ready to go');
      expect(countdownText(const Duration(minutes: 12, seconds: 5)), '12:05');
      expect(countdownText(const Duration(hours: 1, seconds: 2)), '1:00:02');
      expect(countdownText(const Duration(seconds: -3)), '0:00');
    });

    Future<double> riderAt(WidgetTester tester, String status, DateTime now) async {
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(MaterialApp(
        theme: buildTheme(),
        home: Scaffold(
          body: OrderProgressHero(order: Order(unpaid(status: status, extra: {'etaAt': '2026-11-26T10:20:00.000Z'})), now: () => now),
        ),
      ));
      await tester.pump(const Duration(milliseconds: 1500));
      expect(tester.takeException(), isNull);
      return tester.getCenter(find.byKey(const ValueKey('rider'))).dx;
    }

    testWidgets('the rider moves on with the order and the timer counts down', (tester) async {
      final now = DateTime.utc(2026, 11, 26, 10, 10);
      final confirmed = await riderAt(tester, 'Confirmed', now);
      expect(find.text('10:00'), findsOneWidget);
      expect(find.text('About 10 min left.'), findsOneWidget);
      final cooking = await riderAt(tester, 'Cooking', now);
      final onTheWay = await riderAt(tester, 'Out for Delivery', now);
      final completed = await riderAt(tester, 'Completed', now);
      expect([confirmed < cooking, cooking < onTheWay, onTheWay < completed], [true, true, true]);
      expect(find.text('Delivered ✓'), findsOneWidget);
      await riderAt(tester, 'Cooking', DateTime.utc(2026, 11, 26, 10, 30));
      expect(find.text('Almost there'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });
  });

  test('the backup report says the same as the website\'s', () {
    final fixture = jsonDecode(File('test/backup_fixture.json').readAsStringSync()) as Map<String, dynamic>;
    final bytes = Uint8List.fromList(gzip.encode(utf8.encode(jsonEncode(fixture['data']))));
    final data = readBackup(bytes);

    /// Numbers compared as numbers (500 and 500.0 are the same money).
    Object? plain(Object? v) => switch (v) {
          num n => n.toDouble(),
          Map m => {for (final e in m.entries) e.key: plain(e.value)},
          List l => l.map(plain).toList(),
          _ => v,
        };

    for (final c in (fixture['cases'] as List).cast<Map<String, dynamic>>()) {
      final period = c['period'] as String, date = c['date'] as String;
      final expected = c['report'] as Map<String, dynamic>;
      final got = buildReport(data, period: period, date: date);
      final reason = '$period $date';
      expect(got['label'], expected['label'], reason: reason);
      final summary = Map<String, dynamic>.from(expected['summary'] as Map)..remove('codOrders');
      expect(plain(got['summary']), plain(summary), reason: reason);
      for (final key in ['byPayment', 'bestSellers', 'topRevenue', 'categories', 'busiestHours']) {
        expect(plain(got[key]), plain(expected[key]), reason: '$reason $key');
      }
      expect(
        plain([for (final d in got['byDay'] as List) {'day': d['day'], 'orders': d['orders'], 'sales': d['sales']}]),
        plain([for (final d in expected['byDay'] as List) {'day': d['day'], 'orders': d['orders'], 'sales': d['sales']}]),
        reason: reason,
      );
      final feedback = Map<String, dynamic>.from(expected['feedback'] as Map)..remove('distribution');
      expect(plain(got['feedback']), plain(feedback), reason: reason);
      expect(ordersToCsv(got), c['csv'], reason: reason);
      expect(shiftPeriod(period, date, -1), c['previous'], reason: reason);
      expect(shiftPeriod(period, date, 1), c['next'], reason: reason);
    }
    expect(() => readBackup(Uint8List.fromList(utf8.encode('{"tables":{}}'))), throwsFormatException);
    expect(asNum('900.00'), 900);
  });
}
