// Every owner/admin screen, drawn at phone width with answers saved from a local copy of the website
// (admin_fixtures.json). A layout that overflows or an answer that cannot be read fails the test.
// With RECORD_WRITES=<file> the changes the screens send are saved, to be replayed against a local server.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hbt_app/api/api_client.dart';
import 'package:hbt_app/api/token_store.dart';
import 'package:hbt_app/staff/admin/activity_screen.dart';
import 'package:hbt_app/staff/admin/customers_screen.dart';
import 'package:hbt_app/staff/admin/dashboard_screen.dart';
import 'package:hbt_app/staff/admin/deals_admin_screen.dart';
import 'package:hbt_app/staff/admin/menu_admin_screen.dart';
import 'package:hbt_app/staff/admin/menu_pdf_admin_screen.dart';
import 'package:hbt_app/staff/admin/more_screen.dart';
import 'package:hbt_app/staff/admin/reports_screen.dart';
import 'package:hbt_app/staff/admin/settings_screen.dart';
import 'package:hbt_app/staff/admin/staff_access_screen.dart';
import 'package:hbt_app/staff/admin/storage_screen.dart';
import 'package:hbt_app/staff/admin_orders_screen.dart';
import 'package:hbt_app/staff/staff_shell.dart';
import 'package:hbt_app/state/auth_state.dart';
import 'package:hbt_app/theme.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

final Map<String, dynamic> fixtures = jsonDecode(File('test/admin_fixtures.json').readAsStringSync()) as Map<String, dynamic>;
final writes = <Map<String, dynamic>>[];

Map<String, dynamic> first(String path, String key) => ((fixtures[path] as Map)[key] as List).first as Map<String, dynamic>;

ApiClient fakeApi() => ApiClient(
      baseUrl: 'https://shop.example',
      tokens: MemoryTokenStore()..values['hbt_staff'] = 'tok',
      isWeb: false,
      retryDelays: const [],
      client: MockClient((request) async {
        final path = request.url.path;
        if (request.method != 'GET') {
          writes.add({'method': request.method, 'path': path, 'body': request.body.isEmpty ? null : jsonDecode(request.body)});
          return http.Response('{"success":true}', 200);
        }
        if (path == '/api/admin/kitchen') return http.Response('{"orders":[]}', 200);
        if (path == '/api/admin/alerts') return http.Response('{"orders":[]}', 200);
        if (path == '/api/auth/me') return http.Response(jsonEncode({'user': {'id': 's1', 'email': 'owner@example.com', 'role': 'owner'}}), 200);
        final answer = fixtures[path];
        if (answer == null) return http.Response('{"error":"not in fixtures: $path"}', 404);
        return http.Response.bytes(utf8.encode(jsonEncode(answer)), 200, headers: {'content-type': 'application/json; charset=utf-8'});
      }),
    );

Future<void> show(WidgetTester tester, Widget screen, {String role = 'owner', bool scaffold = false, double height = 6000}) async {
  tester.view.physicalSize = Size(360, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  SharedPreferences.setMockInitialValues({'staff_mode': true, 'staff_user': jsonEncode({'id': 's1', 'email': 'owner@example.com', 'role': role})});
  final prefs = await SharedPreferences.getInstance();
  final api = fakeApi();
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: api),
        ChangeNotifierProvider(create: (_) => StaffState(api, prefs)),
      ],
      child: MaterialApp(theme: buildTheme(), home: scaffold ? Scaffold(body: screen) : screen),
    ),
  );
  await settle(tester);
}

Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 4; i++) {
    await tester.pump(const Duration(milliseconds: 150));
  }
}

Future<void> done(WidgetTester tester) async {
  final problem = tester.takeException();
  expect(problem, isNull, reason: problem is FlutterError ? problem.toStringDeep() : null);
  await tester.pumpWidget(const SizedBox()); // stops refresh timers
  await tester.pump(const Duration(seconds: 10));
}

Future<void> tapText(WidgetTester tester, String text, {bool last = false}) async {
  final found = find.text(text);
  await tester.ensureVisible(last ? found.last : found.first);
  await tester.pump(const Duration(milliseconds: 300));
  await tester.tap(last ? found.last : found.first);
  await settle(tester);
}

/// The writes made since [mark].
List<Map<String, dynamic>> since(int mark) => writes.sublist(mark);

void main() {
  tearDownAll(() {
    final out = Platform.environment['RECORD_WRITES'];
    if (out != null) File(out).writeAsStringSync(jsonEncode(writes));
  });

  testWidgets('dashboard', (tester) async {
    await show(tester, const DashboardScreen(), scaffold: true);
    expect(find.text('Money collected'), findsOneWidget);
    expect(find.text('Best-selling items'), findsOneWidget);
    await done(tester);
  });

  testWidgets('menu: availability, categories and saving a product', (tester) async {
    await show(tester, const MenuAdminScreen(), scaffold: true);
    final product = first('/api/admin/products', 'products');
    expect(find.text('${product['name']}'), findsWidgets);

    var mark = writes.length;
    await tapText(tester, 'Sold out');
    expect(since(mark).single['path'], '/api/admin/products/${product['id']}');
    expect((since(mark).single['body'] as Map).keys, ['isSoldOut']);

    mark = writes.length;
    await tester.enterText(find.widgetWithText(TextField, 'New category name'), 'App Test Category');
    await tapText(tester, 'Add');
    expect(since(mark).single, {'method': 'POST', 'path': '/api/admin/categories', 'body': {'name': 'App Test Category'}});

    mark = writes.length;
    await tester.tap(find.byTooltip('Edit ${product['name']}').first);
    await settle(tester);
    expect(find.text('Edit product'), findsOneWidget);
    await tapText(tester, 'Save');
    final saved = since(mark).single;
    expect(saved['method'], 'PATCH');
    expect((saved['body'] as Map)['name'], product['name']);
    expect((saved['body'] as Map).containsKey('stockQty'), isFalse); // stock only changes with a reason
    await done(tester);
  });

  testWidgets('a new product is sent with its price and stock', (tester) async {
    await show(tester, const ProductForm(product: null, categories: []));
    await tester.enterText(find.widgetWithText(TextField, 'Name'), 'App Test Naan');
    await tester.enterText(find.widgetWithText(TextField, 'Price (Rs.)'), '120');
    final mark = writes.length;
    await tapText(tester, 'Save');
    expect(since(mark).single['path'], '/api/admin/products');
    expect((since(mark).single['body'] as Map)['price'], 120);
    await done(tester);
  });

  testWidgets('deals: switch and save', (tester) async {
    await show(tester, const DealsAdminScreen());
    final deal = first('/api/admin/deals', 'deals');
    var mark = writes.length;
    await tapText(tester, 'Active');
    expect(since(mark).single['path'], '/api/admin/deals/${deal['id']}');

    mark = writes.length;
    await tapText(tester, 'Edit');
    expect(find.text('What is included'), findsOneWidget);
    await tapText(tester, 'Save');
    expect(since(mark).single['method'], 'PATCH');
    expect((since(mark).single['body'] as Map)['items'], isA<List>());
    await done(tester);
  });

  testWidgets('menu PDF', (tester) async {
    await show(tester, const MenuPdfAdminScreen());
    expect(find.text('Customers download now'), findsOneWidget);
    expect(find.text('Preview automatic menu'), findsOneWidget);
    await done(tester);
  });

  testWidgets('reports: closing, product sales, downloads', (tester) async {
    await show(tester, const ReportsScreen());
    expect(find.text('Total collected'), findsOneWidget);
    final mark = writes.length;
    await tapText(tester, 'Close this day');
    await tapText(tester, 'Close day');
    expect(since(mark).single['path'], '/api/admin/closing');
    await tapText(tester, 'Product sales');
    expect(find.text('Most ordered'), findsOneWidget);
    await tapText(tester, 'Downloads');
    expect(find.text('Excel'), findsNWidgets(5));
    await done(tester);
  });

  testWidgets('customers and a new coupon', (tester) async {
    await show(tester, const CustomersScreen());
    expect(find.textContaining('spent Rs.'), findsWidgets);
    await tapText(tester, 'Coupons');
    await tester.enterText(find.widgetWithText(TextField, 'Code'), 'APPTEST${DateTime.now().millisecondsSinceEpoch % 100000}');
    await tester.enterText(find.widgetWithText(TextField, 'Amount'), '10');
    final mark = writes.length;
    await tapText(tester, 'Add coupon');
    expect(since(mark).single['path'], '/api/admin/coupons');
    await done(tester);
  });

  testWidgets('storage and backups', (tester) async {
    await show(tester, const StorageScreen());
    expect(find.text('How full is the plan?'), findsOneWidget);
    expect(find.text('Payment screenshots'), findsWidgets);
    await done(tester);
  });

  testWidgets('activity', (tester) async {
    await show(tester, const ActivityScreen());
    expect(find.byType(ListView), findsOneWidget);
    await done(tester);
  });

  testWidgets('staff access: add someone', (tester) async {
    await show(tester, const StaffAccessScreen());
    await tester.enterText(find.widgetWithText(TextField, 'Email'), 'app-test-cook@example.com');
    final mark = writes.length;
    await tapText(tester, 'Add staff', last: true);
    expect(since(mark).single['body'], {'email': 'app-test-cook@example.com', 'role': 'admin'});
    await done(tester);
  });

  testWidgets('shop settings save every section the way the website does', (tester) async {
    await show(tester, const SettingsScreen(), height: 9000);
    final mark = writes.length;
    for (final button in [
      'Save open / closed for orders',
      'Save delivery',
      'Save pickup',
      'Save loyalty points',
      'Save automatic backups',
      'Save storage limits & alerts',
      'Save shop details',
    ]) {
      await tapText(tester, button);
    }
    await tapText(tester, 'Save payment accounts');
    await tapText(tester, 'Save', last: true);
    expect(since(mark).map((w) => (w['body'] as Map)['key']).toList(), ['ordering', 'delivery', 'pickup', 'loyalty', 'backup', 'storage', 'shop', 'payment']);
    await done(tester);
  });

  testWidgets('an admin does not see the owner-only parts', (tester) async {
    await show(tester, const AdminMoreScreen(), role: 'admin', scaffold: true);
    expect(find.text('Staff Access'), findsNothing);
    expect(find.text('Activity'), findsNothing);
    expect(find.text('Shop Settings'), findsOneWidget);
    await done(tester);
    await show(tester, const SettingsScreen(), role: 'admin');
    expect(find.text('Payment accounts'), findsNothing);
    expect(find.text('Save shop details'), findsNothing);
    await done(tester);
  });

  testWidgets('orders list with finished orders can be selected', (tester) async {
    await show(tester, AdminOrdersScreen(onOpen: (_) async {}), scaffold: true);
    await tapText(tester, 'Select all finished');
    expect(find.textContaining('selected'), findsOneWidget);
    await done(tester);
  });

  testWidgets('the owner bottom bar reaches every part', (tester) async {
    await show(tester, const StaffShell(), height: 780);
    for (final tab in ['Menu', 'Dashboard', 'More']) {
      await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text(tab)));
      await settle(tester);
      expect(tester.takeException(), isNull, reason: tab);
    }
    expect(find.text('Menu PDF'), findsOneWidget);
    await done(tester);
  });
}
