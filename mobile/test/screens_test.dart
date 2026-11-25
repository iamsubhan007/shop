import 'dart:convert';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hbt_app/api/api_client.dart';
import 'package:hbt_app/api/token_store.dart';
import 'package:hbt_app/main.dart';
import 'package:hbt_app/staff/alarm.dart';
import 'package:hbt_app/staff/new_order_alert.dart';
import 'package:hbt_app/state/auth_state.dart';
import 'package:hbt_app/theme.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fixtures.dart';

http.Response _json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

class _FakeAlarm implements Alarm {
  bool ringing = false;
  bool disposed = false;

  @override
  Future<void> start() async => ringing = true;

  @override
  Future<void> stop() async => ringing = false;

  @override
  void dispose() => disposed = true;
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  ApiClient api(http.Response Function(http.Request) answer) =>
      ApiClient(baseUrl: 'https://shop.example', tokens: MemoryTokenStore(), isWeb: false, client: MockClient((r) async => answer(r)));

  testWidgets('menu loads, an item goes into the cart and checkout asks for sign-in', (tester) async {
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    final client = api((r) => switch (r.url.path) {
          '/api/menu' => _json(menuJson),
          '/api/settings' => _json(settingsJson),
          _ => http.Response('', 404), // pictures
        });
    final prefs = await SharedPreferences.getInstance();
    await tester.pumpWidget(HbtApp(api: client, prefs: prefs));
    await tester.pumpAndSettle();

    expect(find.text('Crazy Deals & Combos'), findsOneWidget);
    expect(find.text('Family Deal'), findsOneWidget);

    await tester.tap(find.text('Add Deal to Cart'));
    await tester.pumpAndSettle(const Duration(seconds: 4));
    await tester.tap(find.text('Cart'));
    await tester.pumpAndSettle();
    expect(find.text('Your cart (1)'), findsOneWidget);
    expect(find.text('Rs. 1,000'), findsOneWidget); // 900 + 100 delivery

    await tester.tap(find.text('Pickup'));
    await tester.pumpAndSettle();
    expect(find.text('Rs. 900'), findsWidgets);

    await tester.tap(find.text('Proceed to checkout'));
    await tester.pumpAndSettle();
    expect(find.text('Sign in to order'), findsOneWidget);

    await tester.pumpWidget(const SizedBox()); // stop the refresh timer
  });

  testWidgets('Home and Menu both have a Deals category, under a compact bottom bar', (tester) async {
    // A narrow phone, made tall so the items under the deals are built too.
    tester.view.physicalSize = const Size(360 * 3, 2000 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    final client = api((r) => switch (r.url.path) {
          '/api/menu' => _json(menuJson),
          '/api/settings' => _json(settingsJson),
          _ => http.Response('', 404),
        });
    final prefs = await SharedPreferences.getInstance();
    await tester.pumpWidget(HbtApp(api: client, prefs: prefs));
    await tester.pumpAndSettle();

    for (final label in ['Home', 'Menu', 'Cart', 'My Orders', 'More']) {
      expect(find.widgetWithText(NavigationDestination, label), findsOneWidget);
    }
    expect(tester.getSize(find.byType(NavigationBar)).height, 58);
    final context = tester.element(find.byType(NavigationBar));
    expect(MediaQuery.textScalerOf(context).scale(20), 18);

    for (final tab in ['Home', 'Menu']) {
      await tester.tap(find.widgetWithText(NavigationDestination, tab));
      await tester.pumpAndSettle();
      expect(find.text('Full Tandoor Menu'), tab == 'Menu' ? findsOneWidget : findsNothing);
      expect(find.text('Nutella Naan'), findsOneWidget);

      await tester.tap(find.widgetWithText(ChoiceChip, 'Deals'));
      await tester.pumpAndSettle();
      expect(find.text('Crazy Deals & Combos (1)'), findsOneWidget);
      expect(find.text('Family Deal'), findsOneWidget);
      expect(find.text('Nutella Naan'), findsNothing); // only deals under the Deals category

      await tester.tap(find.widgetWithText(ChoiceChip, 'All'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('See all'));
      await tester.pumpAndSettle();
      expect(find.text('Crazy Deals & Combos (1)'), findsOneWidget);
    }

    await tester.pumpWidget(const SizedBox()); // stop the refresh timer
  });

  testWidgets('the alarm rings while an order waits, survives folding, and stops once accepted', (tester) async {
    var waiting = true;
    final sent = <String>[];
    final client = api((r) {
      if (r.url.path == '/api/admin/alerts') {
        return _json(waiting
            ? {
                'count': 1,
                'orders': [
                  {'id': 'o1', 'orderNumber': 'HBT-261125-001', 'status': 'Placed', 'orderType': 'delivery', 'customerName': 'Ali', 'itemCount': 2, 'totalAmount': 700, 'canAccept': true, 'createdAt': DateTime.now().toIso8601String()},
                ],
              }
            : {'count': 0, 'orders': <Object>[]});
      }
      sent.add('${r.method} ${r.url.path} ${r.body}');
      waiting = false;
      return _json({'success': true});
    });
    final prefs = await SharedPreferences.getInstance();
    final alarm = _FakeAlarm();

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          Provider<ApiClient>.value(value: client),
          ChangeNotifierProvider(create: (_) => StaffState(client, prefs)),
        ],
        child: MaterialApp(
          theme: buildTheme(),
          home: Scaffold(body: Column(children: [const Spacer(), NewOrderAlert(onOpen: (_) {}, alarm: alarm)])),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump();

    expect(find.text('NEW ORDER'), findsOneWidget);
    expect(alarm.ringing, isTrue);
    expect(find.textContaining('Rs. 700'), findsOneWidget);

    await tester.tap(find.text('Fold'));
    await tester.pump();
    expect(find.text('Accept order'), findsNothing);
    expect(alarm.ringing, isTrue);
    await tester.tap(find.text('Show'));
    await tester.pump();

    await tester.tap(find.text('Accept order'));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));
    expect(sent.single, 'PATCH /api/admin/orders/o1 {"action":"status","status":"Confirmed"}');
    expect(find.text('NEW ORDER'), findsNothing);
    expect(alarm.ringing, isFalse);

    await tester.pumpWidget(const SizedBox());
    expect(alarm.disposed, isTrue);
  });
}
