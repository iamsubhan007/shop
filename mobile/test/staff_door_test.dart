import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hbt_app/api/api_client.dart';
import 'package:hbt_app/api/token_store.dart';
import 'package:hbt_app/config.dart';
import 'package:hbt_app/main.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fixtures.dart';

const _versionLine = '${AppConfig.appName} · version ${AppConfig.version}';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<void> openMore(WidgetTester tester, {bool signedInCustomer = false}) async {
    tester.view.physicalSize = const Size(390 * 3, 1600 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    final tokens = MemoryTokenStore();
    if (signedInCustomer) tokens.values['hbt_session'] = 'tok';
    http.Response json(Object body) => http.Response(jsonEncode(body), 200, headers: {'content-type': 'application/json'});
    final api = ApiClient(
      baseUrl: 'https://shop.example',
      tokens: tokens,
      isWeb: false,
      client: MockClient((r) async => switch (r.url.path) {
            '/api/menu' => json(menuJson),
            '/api/settings' => json(settingsJson),
            '/api/auth/me' => json({
                'user': {'id': 'u1', 'email': 'ali@example.com', 'fullName': 'Ali', 'phone': '03001234567'},
              }),
            _ => http.Response('', 404),
          }),
    );
    await tester.pumpWidget(HbtApp(api: api, prefs: await SharedPreferences.getInstance()));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(NavigationDestination, 'More'));
    await tester.pumpAndSettle();
  }

  Future<void> tapVersion(WidgetTester tester, int times) async {
    for (var i = 0; i < times; i++) {
      await tester.tap(find.text(_versionLine));
      await tester.pump();
    }
    await tester.pumpAndSettle();
  }

  testWidgets('no staff button is shown; seven taps on the version line open staff sign-in', (tester) async {
    await openMore(tester);
    expect(find.textContaining('Staff'), findsNothing);
    expect(find.textContaining('staff'), findsNothing);

    await tapVersion(tester, 6);
    expect(find.text('Staff sign in'), findsNothing);
    await tapVersion(tester, 1);
    expect(find.text('Staff sign in'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('a signed-in customer cannot reach the staff sign-in', (tester) async {
    await openMore(tester, signedInCustomer: true);
    expect(find.text('Ali'), findsOneWidget);
    expect(find.textContaining('staff'), findsNothing);

    await tapVersion(tester, 20);
    expect(find.text('Staff sign in'), findsNothing);
    expect(find.text(_versionLine), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
  });

  test('the version shown matches pubspec.yaml', () {
    final line = File('pubspec.yaml').readAsLinesSync().firstWhere((l) => l.startsWith('version:'));
    expect(line.split(':')[1].trim().split('+').first, AppConfig.version);
  });
}
