/// End to end against a LOCAL copy of the website (local database, local mail catcher), using the app's own API
/// client and state classes. It creates orders and staff, so it refuses to run against anything but localhost.
///
///   flutter test test/e2e_local_test.dart --dart-define=E2E_BASE=http://localhost:3100 --dart-define=E2E_MAIL=http://127.0.0.1:2626
///
/// E2E_MAIL must answer `GET /code?to=<email>` with the latest sign-in code mailed to that address.
library;

import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:hbt_app/api/api_client.dart';
import 'package:hbt_app/api/token_store.dart';
import 'package:hbt_app/models/menu.dart';
import 'package:hbt_app/models/order.dart';
import 'package:hbt_app/models/settings.dart';
import 'package:hbt_app/state/auth_state.dart';
import 'package:hbt_app/state/cart_state.dart';
import 'package:hbt_app/utils/format.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

const base = String.fromEnvironment('E2E_BASE');
const mail = String.fromEnvironment('E2E_MAIL');
const ownerEmail = String.fromEnvironment('E2E_OWNER', defaultValue: 'owner@example.com');

Future<String> codeFor(String email) async {
  for (var i = 0; i < 60; i++) {
    final res = await http.get(Uri.parse('$mail/code').replace(queryParameters: {'to': email}));
    if (res.statusCode == 200 && RegExp(r'^\d{6}$').hasMatch(res.body)) return res.body;
    await Future<void>.delayed(const Duration(milliseconds: 250));
  }
  throw StateError('no code arrived for $email');
}

void main() {
  final host = Uri.tryParse(base)?.host;
  final local = host == 'localhost' || host == '127.0.0.1';

  test('customer orders, staff cook and deliver it', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    ApiClient client() => ApiClient(baseUrl: base, tokens: MemoryTokenStore(), isWeb: false);

    // ---- owner signs in and makes sure bank transfer is on (restored at the end)
    final ownerApi = client();
    final owner = StaffState(ownerApi, prefs);
    await owner.requestCode(ownerEmail);
    await owner.verifyCode(ownerEmail, await codeFor(ownerEmail));
    expect(owner.user!.role, 'owner');
    expect(await ownerApi.tokens.read('hbt_staff'), isNotNull);

    final settingsBefore = (await ownerApi.get('/api/admin/settings', session: Session.staff))['settings'] as Map<String, dynamic>;
    Future<void> putPayment(Object value) async {
      final res = await http.put(
        ownerApi.url('/api/admin/settings'),
        headers: {...await ownerApi.authHeaders(Session.staff), 'Origin': ownerApi.origin, 'Content-Type': 'application/json'},
        body: jsonEncode({'key': 'payment', 'value': value}),
      );
      expect(res.statusCode, 200, reason: res.body);
    }

    final paymentBefore = settingsBefore['payment'] as Map<String, dynamic>;
    await putPayment({
      ...paymentBefore,
      'bank': {'enabled': true, 'bank_name': 'TEST BANK', 'account_title': 'TEST', 'account_number': '000111', 'iban': ''},
    });
    var restored = false;
    addTearDown(() async {
      if (!restored) await putPayment(paymentBefore);
    });

    // ---- customer signs in
    final api = client();
    final auth = AuthState(api);
    final email = 'app${DateTime.now().millisecondsSinceEpoch}@example.com';
    expect(await auth.requestCode(email), greaterThan(0));
    await expectLater(auth.requestCode(email), throwsA(isA<ApiException>().having((e) => e.status, 'status', 429)));
    final signedIn = await auth.verifyCode(email, await codeFor(email));
    expect(signedIn.complete, isFalse);
    await auth.updateProfile('App Tester', '+92 300 1234567');
    expect(auth.user!.phone, '03001234567');

    // A second launch of the app with the saved token is still signed in.
    final relaunched = AuthState(api);
    await relaunched.load();
    expect(relaunched.user!.email, email);

    // ---- menu, settings, cart
    final menu = MenuData.fromJson(await api.get('/api/menu'));
    final settings = ShopSettings(await api.get('/api/settings'));
    expect(menu.products, isNotEmpty);
    expect(settings.orderingOpen, isTrue, reason: 'run inside shop hours or widen them in the local database');
    final product = menu.products.firstWhere((p) => p.available);
    final cart = CartState(prefs)..clear();
    cart.addProduct(product, quantity: 2, notes: 'crispy');

    final pay = await api.get('/api/settings', session: Session.customer, query: {'payment': '1'});
    expect((pay['paymentInstructions'] as Map)['bank_transfer']['account_number'], '000111');

    // ---- delivery radius
    final near = await api.post('/api/delivery/check', body: {'latitude': settings.lat + 0.003, 'longitude': settings.lng});
    expect(near['eligible'], isTrue);
    final far = await api.post('/api/delivery/check', body: {'latitude': settings.lat + 0.05, 'longitude': settings.lng});
    expect(far['eligible'], isFalse);

    // ---- prepaid pickup order, then a payment screenshot
    Map<String, dynamic> order(String type, String method, {Map<String, dynamic> extra = const {}}) => {
          'orderType': type,
          'customerName': auth.user!.fullName,
          'customerPhone': auth.user!.phone,
          'paymentMethod': method,
          'idempotencyKey': uuidV4(),
          'items': cart.items.map((i) => i.toOrderLine()).toList(),
          ...extra,
        };
    final first = order('pickup', 'bank_transfer');
    final prepaid = await api.post('/api/checkout', session: Session.customer, body: first);
    expect(prepaid['status'], 'Payment Pending');
    final again = await api.post('/api/checkout', session: Session.customer, body: first);
    expect(again['orderId'], prepaid['orderId'], reason: 'a retry must not create a second order');
    final id = '${prepaid['orderId']}';

    final png = base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhWpD4QAAAABJRU5ErkJggg==');
    final upload = await api.uploadImage('/api/upload/proof', Uint8List.fromList(png), filename: 'payment-proof');
    await api.post('/api/orders/$id/payment', session: Session.customer, body: {'reference': 'TX-APP-1', 'proofFile': upload['file']});
    var mine = Order((await api.get('/api/orders/$id', session: Session.customer))['order'] as Map<String, dynamic>);
    expect(mine.status, 'Payment Verification');
    expect(mine.userId, auth.user!.id);
    expect(mine.items.single.notes, 'crispy');

    // ---- staff: alarm, screenshot, verify, timer, discount, edit
    Future<Map<String, dynamic>> staffGet(String path) => ownerApi.get(path, session: Session.staff);
    Future<Map<String, dynamic>> change(Map<String, dynamic> body, [String? orderId]) =>
        ownerApi.patch('/api/admin/orders/${orderId ?? id}', session: Session.staff, body: body);

    final alerts = await staffGet('/api/admin/alerts');
    expect(alerts['count'], greaterThan(0));
    var seen = Order((await staffGet('/api/admin/orders/$id'))['order'] as Map<String, dynamic>);
    expect(seen.payments.single.reference, 'TX-APP-1');
    expect(seen.waText, contains(seen.number));
    expect(await ownerApi.getBytes('/api/files/proof/${seen.proofFile}', session: Session.staff), png);
    expect(await api.getBytes('/api/files/proof/${seen.proofFile}', session: Session.customer), png);
    await expectLater(client().getBytes('/api/files/proof/${seen.proofFile}'), throwsA(isA<ApiException>()));

    await change({'action': 'payment', 'decision': 'verify'});
    await change({'action': 'eta', 'minutes': 20});
    final discounted = await change({'action': 'discount', 'type': 'amount', 'value': 50});
    expect(asNum(discounted['totalAmount']), product.price * 2 - 50);
    seen = Order((await staffGet('/api/admin/orders/$id'))['order'] as Map<String, dynamic>);
    final edited = await change({
      'action': 'items',
      'changes': [
        {'itemId': seen.items.single.id, 'quantity': 3},
      ],
      'add': <Object>[],
    });
    expect(asNum(edited['totalAmount']), product.price * 3 - 50);
    mine = Order((await api.get('/api/orders/$id', session: Session.customer))['order'] as Map<String, dynamic>);
    expect(mine.status, 'Confirmed');
    expect(minutesLeft(mine.etaAt!), inInclusiveRange(18, 20));

    final list = await ownerApi.get('/api/admin/orders', session: Session.staff, query: {'q': mine.number, 'type': 'pickup', 'page': '1'});
    expect(maps(list['orders']).map(Order.new).single.itemsText, contains(product.name));

    // ---- staff roles
    final stamp = DateTime.now().millisecondsSinceEpoch;
    Future<(ApiClient, StaffState)> staffMember(String role) async {
      final address = '$role$stamp@example.com';
      await ownerApi.post('/api/admin/staff', session: Session.staff, body: {'email': address, 'role': role, 'fullName': 'Test $role'});
      final memberApi = client();
      final state = StaffState(memberApi, prefs);
      await state.requestCode(address);
      await state.verifyCode(address, await codeFor(address));
      return (memberApi, state);
    }

    await expectLater(StaffState(client(), prefs).requestCode(email), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'not_staff')));
    final (kitchenApi, kitchen) = await staffMember('kitchen');
    final (riderApi, rider) = await staffMember('rider');
    expect(kitchen.user!.role, 'kitchen');
    expect(rider.user!.isRider, isTrue);

    // A kitchen refusal must not sign the person out.
    await expectLater(
      kitchenApi.patch('/api/admin/orders/$id', session: Session.staff, body: {'action': 'status', 'status': 'Cancelled', 'note': 'no'}),
      throwsA(isA<ApiException>().having((e) => e.status, 'status', 403)),
    );
    await kitchen.checkAfterRefusal();
    expect(kitchen.user, isNotNull);

    // ---- cash on delivery: kitchen cooks it, rider delivers it
    final cod = await api.post('/api/checkout', session: Session.customer, body: order('delivery', 'cod', extra: {
      'deliveryAddress': 'House 1, N Block',
      'deliveryLat': settings.lat + 0.003,
      'deliveryLng': settings.lng,
    }));
    final codId = '${cod['orderId']}';
    for (final status in ['Confirmed', 'Cooking', 'Out for Delivery']) {
      await kitchenApi.patch('/api/admin/orders/$codId', session: Session.staff, body: {'action': 'status', 'status': status});
    }
    final board = await kitchenApi.get('/api/admin/kitchen', session: Session.staff);
    expect(maps(board['orders']).map((o) => o['id']), contains(codId));

    final run = await riderApi.get('/api/rider/orders', session: Session.staff);
    final job = maps(run['active']).map(RiderOrder.new).firstWhere((o) => o.id == codId);
    expect(job.collectCash, isTrue);
    expect(job.amountToCollect, product.price * 2 + settings.deliveryFee);
    expect(job.json.keys, isNot(contains('customerPhone')));
    await expectLater(
      riderApi.post('/api/rider/orders/$codId/deliver', session: Session.staff, body: {'delivered': true, 'paymentReceived': false}),
      throwsA(isA<ApiException>()),
    );
    await riderApi.post('/api/rider/orders/$codId/deliver', session: Session.staff, body: {'delivered': true, 'paymentReceived': true});

    // ---- customer: feedback, reorder, history, cancel
    await api.post('/api/orders/$codId/feedback', session: Session.customer, body: {'rating': 5, 'comment': 'Great'});
    final done = Order((await api.get('/api/orders/$codId', session: Session.customer))['order'] as Map<String, dynamic>);
    expect(done.status, 'Completed');
    expect(done.feedback!.rating, 5);
    final reorder = await api.post('/api/orders/$codId/reorder', session: Session.customer);
    expect(maps(reorder['items']).map(ReorderItem.fromJson).single.available, isTrue);
    final history = await api.get('/api/orders/mine', session: Session.customer);
    expect(maps(history['orders']).map(Order.new).length, 2);

    final toCancel = await api.post('/api/checkout', session: Session.customer, body: order('pickup', 'bank_transfer'));
    await api.post('/api/orders/${toCancel['orderId']}/cancel', session: Session.customer, body: {});

    // ---- tidy up: finish and delete the test orders, remove the test staff's session
    await change({'action': 'status', 'status': 'Cancelled', 'note': 'test cleanup'});
    final removed = await ownerApi.post('/api/admin/orders/delete', session: Session.staff, body: {
      'ids': [id, codId, toCancel['orderId']],
    });
    expect(removed['deleted'], 3);

    await putPayment(paymentBefore);
    restored = true;

    // ---- the menu PDF: the app gets exactly what is published (generated, or the shop's own file)
    final (generated, generatedName) = await api.downloadMenuPdf();
    expect(generatedName, matches(RegExp(r'-Menu-\d{4}-\d\d-\d\d\.pdf$')));
    expect(generated.length, greaterThan(10000));

    Future<Map<String, dynamic>> menuPdfAdmin(Future<http.Response> Function(Map<String, String> headers) send) async {
      final res = await send({...await ownerApi.authHeaders(Session.staff), 'Origin': ownerApi.origin});
      expect(res.statusCode, 200, reason: res.body);
      return jsonDecode(res.body) as Map<String, dynamic>;
    }

    final designed = Uint8List.fromList(utf8.encode('%PDF-1.4\n% designed menu $stamp\n%%EOF\n'));
    final uploaded = await menuPdfAdmin((headers) async {
      final request = http.MultipartRequest('POST', ownerApi.url('/api/admin/menu-pdf'))
        ..headers.addAll(headers)
        ..fields['activate'] = 'true'
        ..files.add(http.MultipartFile.fromBytes('file', designed, filename: 'designed.pdf'));
      return http.Response.fromStream(await request.send());
    });
    expect((await api.downloadMenuPdf()).$1, designed);

    Future<void> backToAutomatic() async {
      await menuPdfAdmin((headers) => http.patch(ownerApi.url('/api/admin/menu-pdf'), headers: {...headers, 'Content-Type': 'application/json'}, body: jsonEncode({'action': 'automatic'})));
    }

    await backToAutomatic();
    expect((await api.downloadMenuPdf()).$1.length, greaterThan(10000));
    await menuPdfAdmin((headers) => http.delete(ownerApi.url('/api/admin/menu-pdf/files/${uploaded['id']}'), headers: headers));

    // ---- signing out removes the tokens
    await auth.signOut();
    expect(await api.tokens.read('hbt_session'), isNull);
    await expectLater(api.get('/api/orders/mine', session: Session.customer), throwsA(isA<ApiException>().having((e) => e.status, 'status', 401)));
    await rider.signOut();
    await kitchen.signOut();
    await owner.signOut();
    expect(await ownerApi.tokens.read('hbt_staff'), isNull);
  }, skip: local ? false : 'set E2E_BASE to a local server to run', timeout: const Timeout(Duration(minutes: 3)));
}
