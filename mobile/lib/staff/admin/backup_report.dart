/// A sales report built from the contents of a backup file, on the phone. A port of src/lib/backupReport.js (same
/// money rules and shop-time days), so a day reads the same here, on the website and in the live closing report.
library;

import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show kIsWeb;

import '../../utils/format.dart';
import 'gzip_stub.dart' if (dart.library.io) 'gzip_io.dart';

const _pkOffset = Duration(hours: 5);
const _notCounted = ['Cancelled', 'Rejected'];
const _months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const _dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

double _money(num n) => (n * 100).round() / 100;

/// Reads a backup file (gzipped or plain JSON) and checks it. Throws [FormatException] with a message to show.
Map<String, dynamic> readBackup(Uint8List bytes) {
  Object? data;
  try {
    final zipped = bytes.length > 2 && bytes[0] == 0x1f && bytes[1] == 0x8b;
    if (zipped && kIsWeb) throw const FormatException('web');
    data = jsonDecode(utf8.decode(zipped ? gunzip(bytes) : bytes));
  } catch (_) {
    throw const FormatException('That file could not be read as a shop backup.');
  }
  if (data is! Map<String, dynamic> || data['tables'] is! Map) throw const FormatException('This does not look like a shop backup file.');
  if (data['version'] != 1) throw const FormatException('This backup was made by a different version of the app and cannot be read here.');
  if ((data['tables'] as Map)['orders'] is! List) throw const FormatException('This backup file has no orders in it.');
  return data;
}

List<Map<String, dynamic>> _table(Map<String, dynamic> data, String name) {
  final rows = (data['tables'] as Map)[name];
  return rows is List ? rows.whereType<Map<String, dynamic>>().toList() : const [];
}

DateTime? _time(Object? v) => v == null ? null : DateTime.tryParse('$v'.replaceFirst(' ', 'T'))?.toUtc();

DateTime _wall(DateTime instant) => instant.toUtc().add(_pkOffset);

String pkDay(DateTime instant) => _wall(instant).toIso8601String().substring(0, 10);

DateTime _startOfPkDay(int y, int m, int d) => DateTime.utc(y, m, d).subtract(_pkOffset);

String _labelDay(DateTime instant) {
  final w = _wall(instant);
  return '${_dow[w.weekday - 1]} ${w.day} ${_months[w.month - 1].substring(0, 3)}';
}

class Period {
  const Period(this.from, this.to, this.label, this.days);

  final DateTime from;
  final DateTime to;
  final String label;
  final List<String> days;
}

/// [period]: 'day', 'week' (Monday to Sunday) or 'month'. [date] is yyyy-mm-dd.
Period periodRange(String period, String date) {
  final p = date.split('-').map(int.parse).toList();
  final y = p[0], m = p[1], d = p.length > 2 ? p[2] : 1;
  late final DateTime from, to;
  if (period == 'week') {
    from = _startOfPkDay(y, m, d - (DateTime.utc(y, m, d).weekday - 1));
    to = from.add(const Duration(days: 7));
  } else if (period == 'month') {
    from = _startOfPkDay(y, m, 1);
    to = _startOfPkDay(y, m + 1, 1);
  } else {
    from = _startOfPkDay(y, m, d);
    to = from.add(const Duration(days: 1));
  }
  final days = [for (var t = from; t.isBefore(to); t = t.add(const Duration(days: 1))) pkDay(t)];
  final last = to.subtract(const Duration(days: 1));
  final label = period == 'month'
      ? '${_months[m - 1]} $y'
      : period == 'week'
          ? '${_labelDay(from)} - ${_labelDay(last)} ${_wall(last).year}'
          : '${_labelDay(from)} $y';
  return Period(from, to, label, days);
}

/// The same kind of period one step earlier (-1) or later (+1).
String shiftPeriod(String period, String date, int dir) {
  final r = periodRange(period, date);
  if (period == 'month') {
    final p = date.split('-').map(int.parse).toList();
    return pkDay(_startOfPkDay(p[0], p[1] + dir, 1));
  }
  return pkDay(r.from.add(Duration(days: dir * (period == 'week' ? 7 : 1))));
}

({String? takenAt, int orders, String? firstDay, String? lastDay}) backupInfo(Map<String, dynamic> data) {
  final orders = _table(data, 'orders');
  final times = orders.map((o) => _time(o['created_at'])).whereType<DateTime>().toList()..sort();
  return (
    takenAt: data['createdAt'] as String?,
    orders: orders.length,
    firstDay: times.isEmpty ? null : pkDay(times.first),
    lastDay: times.isEmpty ? null : pkDay(times.last),
  );
}

List<Map<String, dynamic>> _top(Map<String, ({num qty, num revenue})> map, bool byQty, int n) {
  final rows = [for (final e in map.entries) <String, dynamic>{'title': e.key, 'qty': e.value.qty, 'revenue': e.value.revenue}];
  rows.sort((a, b) {
    final c = asNum(b[byQty ? 'qty' : 'revenue']).compareTo(asNum(a[byQty ? 'qty' : 'revenue']));
    return c != 0 ? c : '${a['title']}'.compareTo('${b['title']}');
  });
  return rows.take(n).toList();
}

/// The same shape as the website's `buildReport`.
Map<String, dynamic> buildReport(Map<String, dynamic> data, {required String period, required String date}) {
  final range = periodRange(period, date);
  final inRange = <(Map<String, dynamic>, DateTime)>[
    for (final o in _table(data, 'orders'))
      if (_time(o['created_at']) case final at? when !at.isBefore(range.from) && at.isBefore(range.to)) (o, at),
  ]..sort((a, b) => b.$2.compareTo(a.$2));
  final all = [for (final x in inRange) x.$1];
  bool counted(Map<String, dynamic> o) => !_notCounted.contains(o['status']);
  final live = all.where(counted).toList();
  double sum(Iterable<Map<String, dynamic>> rows, String field) => _money(rows.fold<num>(0, (s, o) => s + asNum(o[field])));
  double verified(String method) => sum(live.where((o) => o['payment_method'] == method && o['payment_status'] == 'verified'), 'total_amount');

  final bank = verified('bank_transfer'), jazz = verified('jazzcash'), easy = verified('easypaisa');
  final cod = sum(all.where((o) => o['payment_status'] == 'cod_collected'), 'total_amount');
  final gross = sum(live, 'total_amount');

  final summary = <String, dynamic>{
    'received': all.length,
    'completed': all.where((o) => o['status'] == 'Completed').length,
    'cancelled': all.where((o) => !counted(o)).length,
    'inProgress': all.where((o) => !['Completed', ..._notCounted].contains(o['status'])).length,
    'pickup': all.where((o) => o['order_type'] == 'pickup').length,
    'delivery': all.where((o) => o['order_type'] == 'delivery').length,
    'gross': gross,
    'averageOrder': live.isEmpty ? 0 : _money(gross / live.length),
    'discounts': sum(live, 'discount_amount'),
    'deliveryFees': sum(live, 'delivery_fee'),
    'bankVerified': bank,
    'jazzcashVerified': jazz,
    'easypaisaVerified': easy,
    'codCollected': cod,
    'collected': _money(bank + jazz + easy + cod),
    'pendingPayments': sum(live.where((o) => o['payment_method'] != 'cod' && const ['pending', 'submitted', 'rejected'].contains(o['payment_status'])), 'total_amount'),
    'outstandingCod': sum(live.where((o) => o['payment_status'] == 'cod_pending'), 'total_amount'),
  };

  final pay = <String, ({int orders, num amount})>{};
  for (final o in live) {
    final key = '${o['payment_method']}';
    final v = pay[key] ?? (orders: 0, amount: 0);
    pay[key] = (orders: v.orders + 1, amount: _money(v.amount + asNum(o['total_amount'])));
  }
  final byPayment = [for (final e in pay.entries) <String, dynamic>{'method': e.key, 'orders': e.value.orders, 'amount': e.value.amount}]
    ..sort((a, b) => asNum(b['amount']).compareTo(asNum(a['amount'])));

  final days = {for (final d in range.days) d: <String, dynamic>{'day': d, 'orders': 0, 'sales': 0.0}};
  for (final (o, at) in inRange) {
    final row = days[pkDay(at)];
    if (row == null) continue;
    row['orders'] = (row['orders'] as int) + 1;
    if (counted(o)) row['sales'] = _money((row['sales'] as double) + asNum(o['total_amount']));
  }

  final liveIds = {for (final o in live) o['id']};
  final categoryName = {for (final c in _table(data, 'categories')) c['id']: '${c['name']}'};
  final categoryOf = {for (final p in _table(data, 'products')) p['id']: categoryName[p['category_id']] ?? 'Other'};
  final items = <String, ({num qty, num revenue})>{};
  final categories = <String, ({num qty, num revenue})>{};
  void add(Map<String, ({num qty, num revenue})> map, String key, num q, num r) {
    final v = map[key] ?? (qty: 0, revenue: 0);
    map[key] = (qty: v.qty + q, revenue: _money(v.revenue + r));
  }

  for (final it in _table(data, 'order_items')) {
    if (!liveIds.contains(it['order_id'])) continue;
    final q = asNum(it['quantity']), r = asNum(it['subtotal_price']);
    add(items, '${it['item_title']}', q, r);
    add(categories, categoryOf[it['product_id']] ?? 'Other', q, r);
  }

  final hours = <int, int>{};
  for (final (o, at) in inRange) {
    if (counted(o)) hours[_wall(at).hour] = (hours[_wall(at).hour] ?? 0) + 1;
  }
  final busiest = hours.entries.toList()..sort((a, b) => b.value != a.value ? b.value.compareTo(a.value) : a.key.compareTo(b.key));

  final numberOf = {for (final o in all) o['id']: '${o['order_number']}'};
  final feedback = _table(data, 'order_feedback').where((f) => numberOf.containsKey(f['order_id'])).toList();
  final distribution = [0, 0, 0, 0, 0];
  for (final f in feedback) {
    final r = asNum(f['rating']).round();
    if (r >= 1 && r <= 5) distribution[r - 1]++;
  }
  final rated = distribution.fold(0, (a, b) => a + b);
  var score = 0;
  for (var i = 0; i < 5; i++) {
    score += distribution[i] * (i + 1);
  }
  final comments = feedback.where((f) => '${f['comment'] ?? ''}'.isNotEmpty).toList()
    ..sort((a, b) => (_time(b['updated_at']) ?? DateTime(0)).compareTo(_time(a['updated_at']) ?? DateTime(0)));

  return {
    'label': range.label,
    'summary': summary,
    'byPayment': byPayment,
    'byDay': days.values.toList(),
    'bestSellers': _top(items, true, 10),
    'topRevenue': _top(items, false, 10),
    'categories': _top(categories, false, 20),
    'busiestHours': [for (final e in busiest.take(3)) <String, dynamic>{'hour': '${'${e.key}'.padLeft(2, '0')}:00', 'orders': e.value}],
    'feedback': <String, dynamic>{
      'count': feedback.length,
      'average': rated == 0 ? null : (score / rated * 10).round() / 10,
      'comments': [for (final f in comments.take(8)) <String, dynamic>{'rating': f['rating'], 'comment': f['comment'], 'orderNumber': numberOf[f['order_id']]}],
    },
    'orders': [
      for (final (o, at) in inRange)
        <String, dynamic>{
          'orderNumber': o['order_number'],
          'createdAt': at,
          'customerName': '${o['customer_name'] ?? ''}',
          'type': o['order_type'],
          'status': o['status'],
          'paymentMethod': o['payment_method'],
          'paymentStatus': o['payment_status'],
          'subtotal': asNum(o['subtotal']),
          'discount': asNum(o['discount_amount']),
          'delivery': asNum(o['delivery_fee']),
          'total': asNum(o['total_amount']),
        },
    ],
  };
}

String _cell(Object? v) {
  var s = '${v ?? ''}';
  if (RegExp(r'^[=+\-@\t\r]').hasMatch(s)) s = "'$s"; // a name that starts like a formula must not run in Excel
  return RegExp('[",\n\r]').hasMatch(s) ? '"${s.replaceAll('"', '""')}"' : s;
}

/// The period's orders as CSV (customer name only: no phone, email or address).
String ordersToCsv(Map<String, dynamic> report) {
  const head = ['Order #', 'Date and time (Pakistan)', 'Customer', 'Type', 'Status', 'Payment', 'Payment status', 'Items total', 'Discount', 'Delivery', 'Total'];
  String number(Object? v) => v is double && v == v.roundToDouble() ? '${v.round()}' : '$v';
  final rows = [
    for (final o in (report['orders'] as List).cast<Map<String, dynamic>>())
      [
        o['orderNumber'],
        _wall(o['createdAt'] as DateTime).toIso8601String().substring(0, 16).replaceFirst('T', ' '),
        o['customerName'],
        o['type'],
        o['status'],
        o['paymentMethod'],
        o['paymentStatus'],
        number(o['subtotal']),
        number(o['discount']),
        number(o['delivery']),
        number(o['total']),
      ],
  ];
  return [head, ...rows].map((r) => r.map(_cell).join(',')).join('\r\n');
}
