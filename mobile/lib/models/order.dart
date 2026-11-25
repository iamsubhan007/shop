import '../utils/format.dart';
import 'menu.dart' show maps;

/// One line of an order. The customer and staff APIs name some fields differently; both are read here.
class OrderLine {
  const OrderLine({
    required this.id,
    required this.title,
    required this.quantity,
    this.unitPrice = 0,
    this.subtotal = 0,
    this.notes,
  });

  final String id;
  final String title;
  final int quantity;
  final num unitPrice;
  final num subtotal;
  final String? notes;

  factory OrderLine.fromJson(Map<String, dynamic> j) {
    final qty = asNum(j['quantity']).toInt();
    final unit = asNum(j['unitPrice']);
    final sub = j['subtotal'] ?? j['subtotalPrice'];
    return OrderLine(
      id: '${j['id'] ?? ''}',
      title: '${j['title'] ?? j['itemTitle'] ?? ''}',
      quantity: qty,
      unitPrice: unit,
      subtotal: sub == null ? unit * qty : asNum(sub),
      notes: j['notes'] as String?,
    );
  }
}

class HistoryEntry {
  const HistoryEntry({required this.to, this.at, this.note});

  final String to;
  final DateTime? at;
  final String? note;

  factory HistoryEntry.fromJson(Map<String, dynamic> j) => HistoryEntry(
        to: '${j['to'] ?? j['toStatus'] ?? ''}',
        at: parseDate(j['at'] ?? j['createdAt']),
        note: j['note'] as String?,
      );
}

class PaymentRecord {
  const PaymentRecord({required this.reference, required this.status, this.adminNotes, this.proofFile});

  final String reference;
  final String status;
  final String? adminNotes;
  final String? proofFile;

  factory PaymentRecord.fromJson(Map<String, dynamic> j) => PaymentRecord(
        reference: '${j['transactionReference'] ?? ''}',
        status: '${j['status'] ?? ''}',
        adminNotes: j['adminNotes'] as String?,
        proofFile: j['proofImageUrl'] as String?,
      );
}

class OrderFeedback {
  const OrderFeedback(this.rating, this.comment);

  final int rating;
  final String? comment;

  static OrderFeedback? fromJson(Object? j) => j is Map<String, dynamic>
      ? OrderFeedback(asNum(j['rating']).toInt(), j['comment'] as String?)
      : null;
}

/// An order as returned by /api/orders/:id, /api/admin/orders and /api/admin/orders/:id.
class Order {
  Order(this.json);

  final Map<String, dynamic> json;

  String get id => '${json['id']}';
  String get number => '${json['orderNumber']}';
  String? get userId => json['userId'] as String?;
  String get type => '${json['orderType']}';
  bool get isDelivery => type == 'delivery';
  String get status => '${json['status']}';
  String get paymentMethod => '${json['paymentMethod']}';
  String get paymentStatus => '${json['paymentStatus']}';
  String get customerName => '${json['customerName'] ?? ''}';
  String get customerPhone => '${json['customerPhone'] ?? ''}';
  String get customerEmail => '${json['customerEmail'] ?? ''}';
  String get address => '${json['deliveryAddress'] ?? ''}';
  double? get lat => json['deliveryLat'] == null ? null : double.tryParse('${json['deliveryLat']}');
  double? get lng => json['deliveryLng'] == null ? null : double.tryParse('${json['deliveryLng']}');
  int? get distanceM => json['distanceKm'] == null ? null : (asNum(json['distanceKm']) * 1000).round();
  num get subtotal => asNum(json['subtotal']);
  num get discount => asNum(json['discountAmount']);
  num get manualDiscount => asNum(json['manualDiscount']);
  num get deliveryFee => asNum(json['deliveryFee']);
  num get total => asNum(json['totalAmount']);
  String? get specialInstructions => json['specialInstructions'] as String?;
  String? get cancelReason => json['cancelReason'] as String?;
  DateTime? get createdAt => parseDate(json['createdAt']);
  DateTime? get etaAt => parseDate(json['etaAt']);

  /// Set while the shop's payment reminder has not been answered.
  DateTime? get paymentReminderAt => parseDate(json['paymentReminderAt']);

  /// Whether the payment form is open to this customer; a server without reminders does not say.
  bool? get canSubmitPayment => json['canSubmitPayment'] as bool?;
  String? get proofFile => json['paymentProofUrl'] as String?;
  int? get feedbackRating => json['feedbackRating'] == null ? null : asNum(json['feedbackRating']).toInt();
  OrderFeedback? get feedback => OrderFeedback.fromJson(json['feedback']);
  String get waText => '${json['waText'] ?? ''}';

  late final List<OrderLine> items = maps(json['items']).map(OrderLine.fromJson).toList();
  late final List<HistoryEntry> history = maps(json['history']).map(HistoryEntry.fromJson).toList();
  late final List<PaymentRecord> payments = maps(json['payments']).map(PaymentRecord.fromJson).toList();

  String get itemsText => items.map((i) => '${i.quantity}× ${i.title}').join(', ');
}

class ReorderItem {
  const ReorderItem({
    required this.type,
    required this.id,
    required this.title,
    required this.quantity,
    required this.available,
    this.price = 0,
    this.oldPrice = 0,
    this.priceChanged = false,
    this.imageUrl,
  });

  final String type;
  final String? id;
  final String title;
  final int quantity;
  final bool available;
  final num price;
  final num oldPrice;
  final bool priceChanged;
  final String? imageUrl;

  factory ReorderItem.fromJson(Map<String, dynamic> j) => ReorderItem(
        type: '${j['type']}',
        id: j['id'] as String?,
        title: '${j['title']}',
        quantity: asNum(j['quantity']).toInt(),
        available: j['available'] == true && j['id'] != null,
        price: asNum(j['price']),
        oldPrice: asNum(j['oldPrice']),
        priceChanged: j['priceChanged'] == true,
        imageUrl: j['imageUrl'] as String?,
      );
}

/// What a rider is allowed to see (the server never sends a phone number or email).
class RiderOrder {
  RiderOrder(this.json);

  final Map<String, dynamic> json;

  String get id => '${json['id']}';
  String get number => '${json['orderNumber']}';
  String get customerName => '${json['customerName'] ?? ''}';
  String get address => '${json['address'] ?? ''}';
  double? get lat => json['lat'] == null ? null : asNum(json['lat']).toDouble();
  double? get lng => json['lng'] == null ? null : asNum(json['lng']).toDouble();
  int? get distanceM => json['distanceM'] == null ? null : asNum(json['distanceM']).toInt();
  String? get specialInstructions => json['specialInstructions'] as String?;
  num get subtotal => asNum(json['subtotal']);
  num get discount => asNum(json['discountAmount']);
  num get deliveryFee => asNum(json['deliveryFee']);
  num get total => asNum(json['totalAmount']);
  String get paymentMethod => '${json['paymentMethod']}';
  bool get collectCash => json['collectCash'] == true;
  num get amountToCollect => asNum(json['amountToCollect']);
  DateTime? get placedAt => parseDate(json['placedAt']);
  DateTime? get deliveredAt => parseDate(json['deliveredAt']);

  late final List<OrderLine> items = maps(json['items']).map(OrderLine.fromJson).toList();
}
