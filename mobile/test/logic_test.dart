import 'package:flutter_test/flutter_test.dart';
import 'package:hbt_app/models/menu.dart';
import 'package:hbt_app/models/order.dart';
import 'package:hbt_app/models/settings.dart';
import 'package:hbt_app/state/cart_state.dart';
import 'package:hbt_app/utils/format.dart';
import 'package:hbt_app/utils/order_status.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fixtures.dart';

void main() {
  group('formatting', () {
    test('money', () {
      expect(rs(500), 'Rs. 500');
      expect(rs('1234567.00'), 'Rs. 1,234,567');
      expect(rs(99.5), 'Rs. 99.50');
      expect(rs(null), 'Rs. 0');
    });

    test('dates are shown in Pakistan time', () {
      expect(when(DateTime.utc(2026, 11, 25, 20, 5)), '26 Nov 2026, 1:05 AM');
      expect(when(DateTime.utc(2026, 11, 25, 7, 0)), '25 Nov 2026, 12:00 PM');
    });

    test('Pakistani mobile numbers', () {
      expect(normalizePkPhone('0309 4130285'), '03094130285');
      expect(normalizePkPhone('+92-309-4130285'), '03094130285');
      expect(normalizePkPhone('12345'), isNull);
    });

    test('WhatsApp links use the international form', () {
      expect(whatsappNumber('03094130285'), '923094130285');
      expect(whatsappNumber('+92 309 4130285'), '923094130285');
      expect(whatsappNumber('923094130285'), '923094130285');
    });

    test('countdown rounds up', () {
      final now = DateTime(2026, 1, 1, 12);
      expect(minutesLeft(now.add(const Duration(seconds: 61)), now), 2);
      expect(minutesLeft(now.subtract(const Duration(minutes: 3)), now), -3);
    });

    test('idempotency keys are version 4 UUIDs', () {
      final pattern = RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
      expect(pattern.hasMatch(uuidV4()), isTrue);
      expect(uuidV4(), isNot(uuidV4()));
    });
  });

  group('order workflow', () {
    test('no cash on delivery for pickup', () {
      expect(paymentMethodsFor('pickup'), isNot(contains('cod')));
      expect(paymentMethodsFor('delivery'), contains('cod'));
    });

    test('an unverified prepaid order cannot be accepted or completed', () {
      final actions = adminStatusActions(status: 'Payment Verification', orderType: 'pickup', paymentMethod: 'jazzcash', paymentStatus: 'submitted');
      expect(actions, isNot(contains('Confirmed')));
      expect(actions, isNot(contains('Completed')));
      expect(actions, isNot(contains('Rejected')));
      expect(actions, containsAll(['Payment Pending', 'Cancelled']));
    });

    test('owner/admin can complete or cancel from any live step, and nothing once finished', () {
      expect(
        adminStatusActions(status: 'Cooking', orderType: 'delivery', paymentMethod: 'cod', paymentStatus: 'cod_pending'),
        ['Out for Delivery', 'Cancelled', 'Completed'],
      );
      for (final done in terminalStatuses) {
        expect(adminStatusActions(status: done, orderType: 'pickup', paymentMethod: 'cod', paymentStatus: 'cod_pending'), isEmpty);
      }
    });

    test('timeline has a payment step only for prepaid orders', () {
      expect(timelineSteps('delivery', 'cod'), ['Placed', 'Confirmed', 'Cooking', 'Out for Delivery', 'Completed']);
      expect(timelineSteps('pickup', 'easypaisa'), contains('Payment Verification'));
    });
  });

  group('server data', () {
    test('reads the live menu and settings', () {
      final menu = MenuData.fromJson(menuJson);
      expect(menu.categories, hasLength(2));
      expect(menu.products.first.name, 'Nutella Naan');
      expect(menu.products.first.gallery, ['/Nutella.jpg']);
      expect(menu.deals.single.items, ['2x Nutella Naan']);
      expect(menu.deals.single.badge, 'Best value');
      final sections = menu.sections(menu.products);
      expect(sections.map((s) => s.$1), ['Special Items', 'Regular Items']);

      final s = ShopSettings(settingsJson);
      expect(s.radiusM, 1000);
      expect(s.deliveryAvailable, isTrue);
      expect(s.methodEnabled('jazzcash'), isTrue);
      expect(s.methodEnabled('easypaisa'), isFalse);
      expect(s.methodEnabled('cod'), isTrue);
      expect(s.estimateDeliveryFee('delivery', 500), 100);
      expect(s.estimateDeliveryFee('pickup', 500), 0);
    });

    test('reads both the customer and the staff order shapes', () {
      final customer = Order({
        'id': 'a',
        'orderNumber': 'HBT-261125-001',
        'orderType': 'pickup',
        'items': [
          {'id': 'l1', 'title': 'Rogni Naan', 'quantity': 2, 'unitPrice': 100, 'subtotal': 200},
        ],
        'history': [
          {'to': 'Placed', 'at': '2026-11-25T10:00:00.000Z'},
        ],
      });
      final staff = Order({
        'id': 'a',
        'subtotal': '200.00',
        'distanceKm': '0.42',
        'deliveryLat': '31.47',
        'items': [
          {'id': 'l1', 'itemTitle': 'Rogni Naan', 'quantity': 2, 'unitPrice': '100.00', 'subtotalPrice': '200.00'},
        ],
        'history': [
          {'toStatus': 'Placed', 'createdAt': '2026-11-25T10:00:00.000Z', 'note': 'Order placed'},
        ],
      });
      for (final o in [customer, staff]) {
        expect(o.items.single.title, 'Rogni Naan');
        expect(o.items.single.subtotal, 200);
        expect(o.history.single.to, 'Placed');
        expect(o.history.single.at, isNotNull);
      }
      expect(staff.subtotal, 200);
      expect(staff.distanceM, 420);
      expect(staff.lat, 31.47);
    });
  });

  group('cart', () {
    late SharedPreferences prefs;
    late CartState cart;
    final menu = MenuData.fromJson(menuJson);

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      prefs = await SharedPreferences.getInstance();
      cart = CartState(prefs);
    });

    test('same item merges, different instructions do not, and quantity is capped', () {
      final p = menu.products.first;
      cart.addProduct(p);
      cart.addProduct(p, quantity: 2);
      cart.addProduct(p, notes: 'crispy');
      expect(cart.items, hasLength(2));
      expect(cart.count, 4);
      expect(cart.subtotal, 2000);
      cart.setQuantity(cart.items.first.key, 999);
      expect(cart.items.first.quantity, maxQuantity);
      cart.setQuantity(cart.items.first.key, 0);
      expect(cart.items, hasLength(1));
    });

    test('survives an app restart, with favourites and order type', () {
      cart.addDeal(menu.deals.single);
      cart.setOrderType('pickup');
      cart.toggleFavorite('x');
      cart.setAddress('House 1, N Block');
      final again = CartState(prefs);
      expect(again.items.single.isDeal, isTrue);
      expect(again.orderType, 'pickup');
      expect(again.isFavorite('x'), isTrue);
      expect(again.address, 'House 1, N Block');
    });

    test('follows today\'s prices and flags what left the menu', () {
      cart.add(CartItem(id: menu.products.first.id, isDeal: false, title: 'Old name', price: 1));
      cart.add(CartItem(id: 'gone', isDeal: false, title: 'Gone', price: 10));
      cart.syncWithMenu(menu);
      expect(cart.items.first.title, 'Nutella Naan');
      expect(cart.items.first.price, 500);
      expect(cart.items.last.available, isFalse);
      expect(cart.hasUnavailable, isTrue);
    });

    test('order lines never send a price', () {
      cart.addProduct(menu.products.first, notes: ' extra ');
      expect(cart.items.single.toOrderLine(), {'type': 'product', 'id': menu.products.first.id, 'quantity': 1, 'notes': 'extra'});
    });
  });
}
