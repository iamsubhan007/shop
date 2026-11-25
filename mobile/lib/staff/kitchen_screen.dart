import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../api/api_client.dart';
import '../models/menu.dart' show maps;
import '../models/order.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../widgets/common.dart';
import '../widgets/poller.dart';
import 'staff_api.dart';

typedef _Column = ({String title, List<String> statuses, String? next, String? button});

const List<_Column> _columns = [
  (title: 'New', statuses: ['Placed'], next: 'Confirmed', button: 'Accept order'),
  (title: 'Confirmed', statuses: ['Confirmed'], next: 'Cooking', button: 'Start cooking'),
  (title: 'Cooking', statuses: ['Cooking'], next: 'READY', button: 'Food is ready'),
  (title: 'Ready', statuses: ['Ready for Pickup', 'Out for Delivery'], next: null, button: null),
];

/// The kitchen board. No money or payment details, big buttons, and the screen stays awake while it is open.
class KitchenScreen extends StatefulWidget {
  const KitchenScreen({super.key});

  @override
  State<KitchenScreen> createState() => _KitchenScreenState();
}

class _KitchenScreenState extends State<KitchenScreen> {
  late final Poller _poller;
  List<Map<String, dynamic>>? _orders;
  String? _error;
  String? _busyId;

  @override
  void initState() {
    super.initState();
    WakelockPlus.enable().ignore();
    _poller = Poller(const Duration(seconds: 8), _load);
  }

  @override
  void dispose() {
    _poller.dispose();
    WakelockPlus.disable().ignore();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final j = await StaffApi.of(context).get('/api/admin/kitchen');
      if (mounted) {
        setState(() {
          _orders = maps(j['orders']);
          _error = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _move(String id, String status) async {
    if (_busyId != null) return;
    setState(() => _busyId = id);
    String? refusal;
    try {
      await StaffApi.of(context).patch('/api/admin/orders/$id', {'action': 'status', 'status': status});
    } on ApiException catch (e) {
      refusal = e.message;
    }
    await _load();
    if (!mounted) return;
    setState(() => _busyId = null);
    if (refusal != null) toast(context, refusal);
  }

  @override
  Widget build(BuildContext context) {
    final orders = _orders;
    if (orders == null) {
      return _error == null
          ? const Center(child: CircularProgressIndicator())
          : EmptyState(icon: Icons.wifi_off, title: 'Could not load the kitchen', message: _error, action: FilledButton(onPressed: _poller.now, child: const Text('Try again')));
    }
    List<Map<String, dynamic>> inColumn(_Column c) => orders.where((o) => c.statuses.contains(o['status'])).toList();
    final error = _error == null ? null : Padding(padding: const EdgeInsets.all(8), child: Notice(_error!));

    // A tablet shows the four columns side by side; a phone shows them as tabs.
    if (MediaQuery.sizeOf(context).width >= 900) {
      return Column(
        children: [
          ?error,
          Expanded(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final c in _columns)
                  Expanded(
                    child: Column(
                      children: [
                        Padding(
                          padding: const EdgeInsets.all(10),
                          child: Text('${c.title} (${inColumn(c).length})', style: const TextStyle(fontWeight: FontWeight.w900)),
                        ),
                        Expanded(child: _list(c, inColumn(c))),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      );
    }

    return DefaultTabController(
      length: _columns.length,
      child: Column(
        children: [
          Material(
            color: Colors.white,
            child: TabBar(
              labelColor: Brand.red,
              labelPadding: const EdgeInsets.symmetric(horizontal: 4),
              // Name and count on two lines, so a busy day's numbers are never cut off on a narrow phone.
              tabs: [
                for (final c in _columns)
                  Tab(
                    height: 54,
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(c.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5)),
                        Text('${inColumn(c).length}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          ?error,
          Expanded(child: TabBarView(children: [for (final c in _columns) _list(c, inColumn(c))])),
        ],
      ),
    );
  }

  Widget _list(_Column column, List<Map<String, dynamic>> orders) => RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(10),
          children: [
            if (orders.isEmpty) const Panel(child: Text('Nothing here', style: TextStyle(color: Brand.muted))),
            for (final o in orders) Padding(padding: const EdgeInsets.only(bottom: 10), child: _ticket(column, o)),
          ],
        ),
      );

  Widget _ticket(_Column column, Map<String, dynamic> o) {
    final id = '${o['id']}';
    final created = parseDate(o['createdAt']);
    final late = created != null && DateTime.now().difference(created).inMinutes > 30;
    final eta = parseDate(o['etaAt']);
    final pickup = o['orderType'] == 'pickup';
    // A prepaid order cannot be accepted until the office has checked the payment.
    final blocked = column.next == 'Confirmed' && o['paymentMethod'] != 'cod';
    final items = maps(o['items']).map(OrderLine.fromJson);
    final instructions = o['specialInstructions'] as String?;
    final number = '${o['orderNumber']}'.split('-').skip(1).join('-');

    Widget action(String label, String status, {Color? color}) => SizedBox(
          height: 56,
          child: FilledButton(
            style: FilledButton.styleFrom(backgroundColor: color, textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
            onPressed: _busyId == null ? () => _move(id, status) : null,
            child: Text(_busyId == id ? 'Saving…' : label),
          ),
        );

    return Panel(
      borderColor: late ? const Color(0xFFFCA5A5) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: Text(number, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900))),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(ago(created), style: TextStyle(fontWeight: FontWeight.w800, color: late ? Brand.red : Brand.inkSoft, fontSize: 12.5)),
                  Text('${o['orderType']}'.toUpperCase(), style: const TextStyle(color: Brand.muted, fontSize: 11)),
                  if (eta != null)
                    Text(
                      minutesLeft(eta) > 0 ? '⏱ ${minutesLeft(eta)} min left' : '⏱ time is up',
                      style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: minutesLeft(eta) > 0 ? const Color(0xFFB45309) : Brand.red),
                    ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 8),
          for (final i in items) ...[
            Text('${i.quantity} × ${i.title}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            if (i.notes != null) Text(i.notes!, style: const TextStyle(color: Brand.muted, fontSize: 12)),
          ],
          if (instructions != null) ...[const SizedBox(height: 8), Notice(instructions, kind: NoticeKind.warning)],
          if (column.next != null && !blocked) ...[
            const SizedBox(height: 10),
            action(column.button!, column.next == 'READY' ? (pickup ? 'Ready for Pickup' : 'Out for Delivery') : column.next!),
          ],
          if (blocked)
            const Padding(
              padding: EdgeInsets.only(top: 8),
              child: Text('Waiting for payment check by the office.', style: TextStyle(color: Brand.muted, fontSize: 12)),
            ),
          if (column.next == null) ...[
            const SizedBox(height: 10),
            action(o['status'] == 'Ready for Pickup' ? 'Handed to customer' : 'Delivered', 'Completed', color: Brand.green),
          ],
        ],
      ),
    );
  }
}
