import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/menu.dart';
import '../utils/format.dart';

const maxQuantity = 50; // the server's limit per line

class CartItem {
  CartItem({
    required this.id,
    required this.isDeal,
    required this.title,
    required this.price,
    this.imageUrl,
    this.quantity = 1,
    this.notes = '',
    this.available = true,
  });

  final String id;
  final bool isDeal;
  String title;
  num price;
  String? imageUrl;
  int quantity;
  final String notes;
  bool available;

  String get key => notes.isEmpty ? id : '$id-$notes';

  Map<String, dynamic> toJson() => {
        'id': id,
        'isDeal': isDeal,
        'title': title,
        'price': price,
        'imageUrl': imageUrl,
        'quantity': quantity,
        'notes': notes,
      };

  factory CartItem.fromJson(Map<String, dynamic> j) => CartItem(
        id: '${j['id']}',
        isDeal: j['isDeal'] == true,
        title: '${j['title']}',
        price: asNum(j['price']),
        imageUrl: j['imageUrl'] as String?,
        quantity: asNum(j['quantity']).toInt().clamp(1, maxQuantity),
        notes: '${j['notes'] ?? ''}',
      );

  /// The shape /api/checkout expects. Prices are not sent: the server uses its own.
  Map<String, dynamic> toOrderLine() => {
        'type': isDeal ? 'deal' : 'product',
        'id': id,
        'quantity': quantity,
        if (notes.isNotEmpty) 'notes': notes,
      };
}

class DeliveryLocation {
  DeliveryLocation({
    required this.lat,
    required this.lng,
    required this.eligible,
    required this.message,
    this.address = '',
  });

  final double lat;
  final double lng;
  final bool eligible;
  final String message;
  String address;

  Map<String, dynamic> toJson() =>
      {'lat': lat, 'lng': lng, 'eligible': eligible, 'message': message, 'address': address};

  factory DeliveryLocation.fromJson(Map<String, dynamic> j) => DeliveryLocation(
        lat: asNum(j['lat']).toDouble(),
        lng: asNum(j['lng']).toDouble(),
        eligible: j['eligible'] == true,
        message: '${j['message'] ?? ''}',
        address: '${j['address'] ?? ''}',
      );
}

/// Cart, order type, delivery point and favourites, all kept on the phone.
class CartState extends ChangeNotifier {
  CartState(this.prefs) {
    _read();
  }

  static const _cartKey = 'cart_v1';
  static const _typeKey = 'order_type';
  static const _locationKey = 'delivery_location';
  static const _favoritesKey = 'favorites';
  static const _addressKey = 'delivery_address';

  final SharedPreferences prefs;

  final List<CartItem> items = [];
  final Set<String> favorites = {};
  String orderType = 'delivery';
  DeliveryLocation? location;

  /// Kept even before a map point is chosen.
  String address = '';

  void _read() {
    try {
      final raw = prefs.getString(_cartKey);
      if (raw != null) {
        items.addAll((jsonDecode(raw) as List).map((e) => CartItem.fromJson(e as Map<String, dynamic>)));
      }
      final loc = prefs.getString(_locationKey);
      if (loc != null) location = DeliveryLocation.fromJson(jsonDecode(loc) as Map<String, dynamic>);
    } catch (_) {
      items.clear();
      location = null;
    }
    orderType = prefs.getString(_typeKey) == 'pickup' ? 'pickup' : 'delivery';
    address = prefs.getString(_addressKey) ?? location?.address ?? '';
    favorites.addAll(prefs.getStringList(_favoritesKey) ?? const []);
  }

  void _changed() {
    prefs.setString(_cartKey, jsonEncode(items.map((i) => i.toJson()).toList()));
    notifyListeners();
  }

  num get subtotal => items.fold<num>(0, (sum, i) => sum + i.price * i.quantity);
  int get count => items.fold(0, (sum, i) => sum + i.quantity);
  bool get hasUnavailable => items.any((i) => !i.available);

  void add(CartItem item) {
    final i = items.indexWhere((x) => x.key == item.key);
    if (i >= 0) {
      items[i].quantity = (items[i].quantity + item.quantity).clamp(1, maxQuantity);
    } else {
      item.quantity = item.quantity.clamp(1, maxQuantity);
      items.add(item);
    }
    _changed();
  }

  void addProduct(Product p, {int quantity = 1, String notes = ''}) => add(CartItem(
        id: p.id,
        isDeal: false,
        title: p.name,
        price: p.price,
        imageUrl: p.imageUrl,
        quantity: quantity,
        notes: notes.trim(),
      ));

  void addDeal(Deal d, {int quantity = 1}) => add(CartItem(
        id: d.id,
        isDeal: true,
        title: d.title,
        price: d.price,
        imageUrl: d.imageUrl,
        quantity: quantity,
      ));

  void setQuantity(String key, int quantity) {
    if (quantity <= 0) {
      items.removeWhere((i) => i.key == key);
    } else {
      for (final i in items.where((i) => i.key == key)) {
        i.quantity = quantity.clamp(1, maxQuantity);
      }
    }
    _changed();
  }

  void clear() {
    items.clear();
    _changed();
  }

  /// Brings stored lines up to date with today's menu, so the cart never shows an old price or a removed item.
  void syncWithMenu(MenuData menu) {
    var changed = false;
    final products = {for (final p in menu.products) p.id: p};
    final deals = {for (final d in menu.deals) d.id: d};
    for (final item in items) {
      final String? title;
      final num? price;
      final bool available;
      if (item.isDeal) {
        final d = deals[item.id];
        title = d?.title;
        price = d?.price;
        available = d != null;
      } else {
        final p = products[item.id];
        title = p?.name;
        price = p?.price;
        available = p != null && p.available;
      }
      if (item.available != available ||
          (title != null && item.title != title) ||
          (price != null && item.price != price)) {
        item.available = available;
        item.title = title ?? item.title;
        item.price = price ?? item.price;
        changed = true;
      }
    }
    if (changed) _changed();
  }

  void setOrderType(String type) {
    if (type == orderType) return;
    orderType = type;
    prefs.setString(_typeKey, type);
    notifyListeners();
  }

  void setLocation(DeliveryLocation value) {
    value.address = address;
    location = value;
    prefs.setString(_locationKey, jsonEncode(value.toJson()));
    notifyListeners();
  }

  void setAddress(String value) {
    address = value;
    location?.address = value;
    prefs.setString(_addressKey, value);
    if (location != null) prefs.setString(_locationKey, jsonEncode(location!.toJson()));
  }

  bool isFavorite(String id) => favorites.contains(id);

  void toggleFavorite(String id) {
    favorites.contains(id) ? favorites.remove(id) : favorites.add(id);
    prefs.setStringList(_favoritesKey, favorites.toList());
    notifyListeners();
  }
}
