import '../utils/format.dart';

Map<String, dynamic> _map(Object? v) => v is Map<String, dynamic> ? v : const {};

/// The public shop settings from /api/settings.
class ShopSettings {
  ShopSettings(this.json);

  final Map<String, dynamic> json;

  Map<String, dynamic> get _shop => _map(json['shop']);
  Map<String, dynamic> get _delivery => _map(json['delivery']);
  Map<String, dynamic> get _ordering => _map(json['orderingState']);
  Map<String, dynamic> get _deliveryState => _map(json['deliveryState']);

  String get shopName => '${_shop['name'] ?? 'Haq Bahu Tandoor'}';
  String get address => '${_shop['address'] ?? ''}';
  String get hours => '${_shop['hours'] ?? ''}';
  String get phone => '${_shop['phone'] ?? ''}';
  String get whatsapp => '${_shop['whatsapp'] ?? ''}';
  String get mapsUrl => '${_shop['maps_url'] ?? ''}';
  double get lat => asNum(_shop['lat']).toDouble();
  double get lng => asNum(_shop['lng']).toDouble();

  bool get deliveryEnabled => _delivery['enabled'] != false;
  bool get pickupEnabled => _map(json['pickup'])['enabled'] != false;
  num get radiusM => asNum(_delivery['radius_m']);
  num get deliveryFee => asNum(_delivery['fee']);
  num get freeOver => asNum(_delivery['free_over']);
  num get minOrder => asNum(_delivery['min_order']);

  /// Delivery switched on and, if the shop set delivery hours, inside them.
  bool get deliveryAvailable => deliveryEnabled && _deliveryState['available'] != false;
  String get deliveryNotice => '${_deliveryState['notice'] ?? ''}';
  bool get deliveryClosedByHours => _deliveryState['reason'] == 'hours';

  bool get orderingOpen => _ordering['open'] != false;
  String get orderingNotice => '${_ordering['notice'] ?? ''}';

  bool methodEnabled(String method) => method == 'cod' || _map(json['paymentMethods'])[method] == true;

  /// Display estimate only: the server computes the real fee at checkout.
  num estimateDeliveryFee(String orderType, num subtotal) {
    if (orderType == 'pickup' || subtotal <= 0) return 0;
    if (freeOver > 0 && subtotal >= freeOver) return 0;
    return deliveryFee;
  }
}
