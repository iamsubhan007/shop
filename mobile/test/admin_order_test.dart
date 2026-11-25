import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:hbt_app/api/api_client.dart';
import 'package:hbt_app/api/token_store.dart';
import 'package:hbt_app/staff/admin_order_screen.dart';
import 'package:hbt_app/state/auth_state.dart';
import 'package:hbt_app/theme.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

final _png = base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhWpD4QAAAABJRU5ErkJggg==');

Map<String, Object?> _order(String status, String paymentStatus) => {
      'id': 'o1',
      'orderNumber': 'HBT-261125-007',
      'orderType': 'pickup',
      'status': status,
      'paymentMethod': 'jazzcash',
      'paymentStatus': paymentStatus,
      'customerName': 'Ali',
      'customerPhone': '03001234567',
      'customerEmail': 'ali@example.com',
      'subtotal': '500.00',
      'discountAmount': '0.00',
      'deliveryFee': '0.00',
      'totalAmount': '500.00',
      'paymentProofUrl': 'shot.png',
      'createdAt': '2026-11-25T10:00:00.000Z',
      'items': [
        {'id': 'l1', 'itemTitle': 'Nutella Naan', 'quantity': 1, 'unitPrice': '500.00', 'subtotalPrice': '500.00'},
      ],
      'history': [
        {'toStatus': 'Payment Verification', 'createdAt': '2026-11-25T10:00:00.000Z', 'note': 'Order placed'},
      ],
      'payments': [
        {'transactionReference': 'TX-99', 'status': 'pending', 'proofImageUrl': 'shot.png'},
      ],
      'waText': 'Order HBT-261125-007',
    };

void main() {
  testWidgets('a submitted payment is checked before the order can be accepted', (tester) async {
    tester.view.physicalSize = const Size(420, 3200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    SharedPreferences.setMockInitialValues({
      'staff_mode': true,
      'staff_user': jsonEncode({'id': 's1', 'email': 'owner@example.com', 'role': 'owner'}),
    });
    final prefs = await SharedPreferences.getInstance();
    final tokens = MemoryTokenStore()..values['hbt_staff'] = 'tok';
    var paid = false;
    final changes = <Map<String, dynamic>>[];
    final proofCookies = <String?>[];

    final api = ApiClient(
      baseUrl: 'https://shop.example',
      tokens: tokens,
      isWeb: false,
      client: MockClient((request) async {
        if (request.url.path == '/api/files/proof/shot.png') {
          proofCookies.add(request.headers['Cookie']);
          return http.Response.bytes(_png, 200, headers: {'content-type': 'image/png'});
        }
        if (request.method == 'PATCH') {
          final body = jsonDecode(request.body) as Map<String, dynamic>;
          changes.add(body);
          if (body['decision'] == 'verify') paid = true;
          return http.Response('{"success":true}', 200);
        }
        return http.Response(
          jsonEncode({'order': paid ? _order('Confirmed', 'verified') : _order('Payment Verification', 'submitted')}),
          200,
        );
      }),
    );

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider<ApiClient>.value(value: api),
          ChangeNotifierProvider(create: (_) => StaffState(api, prefs)),
        ],
        child: MaterialApp(theme: buildTheme(), home: const AdminOrderScreen(orderId: 'o1')),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.textContaining('TX-99'), findsOneWidget);
    expect(proofCookies, ['hbt_staff=tok']);
    expect(find.text('Accept order'), findsNothing);
    expect(find.text('Mark completed'), findsNothing);
    expect(find.text('Delete payment screenshot'), findsNothing); // not until the payment is checked
    expect(find.text('Delete this order'), findsNothing);

    // Rejecting needs a reason.
    await tester.tap(find.text('Reject'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Reject payment')).onPressed, isNull);
    await tester.tap(find.text('Back'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(changes, isEmpty);

    // Cancelling without a reason is stopped before it reaches the server.
    await tester.tap(find.text('Cancel order'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.textContaining('Please write a reason'), findsOneWidget);
    expect(changes, isEmpty);

    await tester.tap(find.text('Payment received ✓'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('Yes'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 400));

    expect(changes, [
      {'action': 'payment', 'decision': 'verify'},
    ]);
    expect(find.text('Cooking'), findsOneWidget);
    expect(find.text('Delete payment screenshot'), findsOneWidget);

    await tester.pumpWidget(const SizedBox()); // stop the refresh timer
  });
}
