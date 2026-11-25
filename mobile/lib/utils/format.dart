/// Money, dates and phone numbers, shown the same way the website shows them.
library;

import 'dart:math';

/// Server numbers arrive either as JSON numbers or as decimal strings ("500.00").
num asNum(Object? v) => v is num ? v : num.tryParse('${v ?? ''}') ?? 0;

String rs(Object? value) {
  final n = asNum(value);
  final negative = n < 0;
  final abs = n.abs();
  final whole = abs == abs.roundToDouble();
  final text = whole ? abs.round().toString() : abs.toStringAsFixed(2);
  final parts = text.split('.');
  final grouped = parts[0].replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (m) => ',');
  return 'Rs. ${negative ? '-' : ''}$grouped${parts.length > 1 ? '.${parts[1]}' : ''}';
}

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// Shop time is Asia/Karachi (UTC+5, no daylight saving).
String when(DateTime? d) {
  if (d == null) return '';
  final pk = d.toUtc().add(const Duration(hours: 5));
  final h = pk.hour % 12 == 0 ? 12 : pk.hour % 12;
  final m = pk.minute.toString().padLeft(2, '0');
  return '${pk.day} ${_months[pk.month - 1]} ${pk.year}, $h:$m ${pk.hour < 12 ? 'AM' : 'PM'}';
}

String ago(DateTime? d, [DateTime? now]) {
  if (d == null) return '';
  final mins = max(0, (now ?? DateTime.now()).difference(d).inMinutes);
  return mins < 60 ? '$mins min' : '${mins ~/ 60}h ${mins % 60}m';
}

/// Whole minutes left until [eta], rounded up like the website. Zero or less means the time is up.
int minutesLeft(DateTime eta, [DateTime? now]) =>
    (eta.difference(now ?? DateTime.now()).inMilliseconds / 60000).ceil();

DateTime? parseDate(Object? v) => v == null ? null : DateTime.tryParse('$v');

/// Pakistani mobile: 03XXXXXXXXX or +923XXXXXXXXX -> 03XXXXXXXXX (same rule as the server).
String? normalizePkPhone(String v) {
  final d = v.replaceAll(RegExp(r'[\s-]'), '');
  final m = RegExp(r'^(?:\+?92|0)(3\d{9})$').firstMatch(d);
  return m == null ? null : '0${m.group(1)}';
}

/// wa.me needs the international form (92...), while the shop settings usually hold the local 03... form.
String whatsappNumber(String v) {
  var d = v.replaceAll(RegExp(r'\D'), '');
  if (d.startsWith('00')) d = d.substring(2);
  if (d.startsWith('0')) d = '92${d.substring(1)}';
  return d;
}

bool looksLikeEmail(String v) => RegExp(r'^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$').hasMatch(v.trim());

/// Random UUID v4, used as the checkout idempotency key.
String uuidV4([Random? random]) {
  final r = random ?? Random.secure();
  final b = List<int>.generate(16, (_) => r.nextInt(256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
}
