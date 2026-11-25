import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:hbt_app/api/api_client.dart';
import 'package:hbt_app/api/token_store.dart';
import 'package:hbt_app/state/auth_state.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _chef = {'id': 's1', 'email': 'chef@example.com', 'fullName': 'Chef', 'role': 'kitchen'};

void main() {
  late MemoryTokenStore tokens;
  late SharedPreferences prefs;

  /// null = offline
  Object? me;

  ApiClient api() => ApiClient(
        baseUrl: 'https://shop.example',
        tokens: tokens,
        isWeb: false,
        client: MockClient((request) async {
          if (me == null) throw http.ClientException('offline');
          if (request.url.path == '/api/auth/staff/otp/verify') {
            return http.Response(jsonEncode({'user': _chef}), 200, headers: {'set-cookie': 'hbt_staff=tok; Path=/'});
          }
          return http.Response(jsonEncode(me), 200);
        }),
      );

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
    tokens = MemoryTokenStore();
    me = {'user': _chef};
  });

  Future<StaffState> signedIn() async {
    final state = StaffState(api(), prefs);
    await state.verifyCode('chef@example.com', '123456');
    return state;
  }

  test('a staff phone reopens into staff screens, even offline', () async {
    await signedIn();
    me = null;
    final relaunched = StaffState(api(), prefs);
    expect(relaunched.showStaffScreens, isTrue);
    await relaunched.load();
    expect(relaunched.showStaffScreens, isTrue);
    expect(relaunched.user!.role, 'kitchen');
  });

  test('an expired session is announced instead of dropping to the customer app', () async {
    final state = await signedIn();
    me = {'user': null};
    await state.checkAfterRefusal();
    await state.checkAfterRefusal(); // several screens can notice at once
    expect(state.showStaffScreens, isFalse);
    expect(state.showSessionEnded, isTrue);
    expect(tokens.values, isEmpty);

    state.setStaffMode(false);
    expect(state.showSessionEnded, isFalse);
  });

  test('a session that expired while the app was closed is announced at launch', () async {
    await signedIn();
    me = {'user': null};
    final relaunched = StaffState(api(), prefs);
    await relaunched.load();
    expect(relaunched.showSessionEnded, isTrue);
  });

  test('signing out goes straight back to the customer app', () async {
    final state = await signedIn();
    await state.signOut();
    expect(state.showStaffScreens, isFalse);
    expect(state.showSessionEnded, isFalse);
    expect(StaffState(api(), prefs).user, isNull);
  });
}
