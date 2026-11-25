import 'package:material_ui/material_ui.dart';

import '../api/api_client.dart';
import '../models/menu.dart' show maps;
import '../models/order.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../utils/order_status.dart';
import '../widgets/common.dart';
import '../widgets/poller.dart';
import 'staff_api.dart';

/// The rider's whole app: orders out for delivery with the address, a map link, the items and the bill, and one
/// button to confirm the delivery (and the cash, for cash on delivery).
class RiderScreen extends StatefulWidget {
  const RiderScreen({super.key});

  @override
  State<RiderScreen> createState() => _RiderScreenState();
}

class _RiderScreenState extends State<RiderScreen> {
  late final Poller _poller;
  List<RiderOrder>? _active;
  List<RiderOrder> _recent = const [];
  final _collected = <String>{};
  String? _error;
  String? _message;
  String? _busyId;

  @override
  void initState() {
    super.initState();
    _poller = Poller(const Duration(seconds: 15), _load);
  }

  @override
  void dispose() {
    _poller.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final j = await StaffApi.of(context).get('/api/rider/orders');
      if (mounted) {
        setState(() {
          _active = maps(j['active']).map(RiderOrder.new).toList();
          _recent = maps(j['recent']).map(RiderOrder.new).toList();
          _error = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _deliver(RiderOrder o) async {
    final question = o.collectCash
        ? 'Confirm: ${o.number} was delivered and you collected ${rs(o.amountToCollect)} in cash?'
        : 'Confirm: ${o.number} was delivered?';
    if (!await confirm(context, question, yes: 'Confirm', no: 'Not yet') || !mounted) return;
    setState(() {
      _busyId = o.id;
      _error = null;
      _message = null;
    });
    String? refusal;
    try {
      await StaffApi.of(context).post('/api/rider/orders/${o.id}/deliver', {
        'delivered': true,
        if (o.collectCash) 'paymentReceived': _collected.contains(o.id),
      });
    } on ApiException catch (e) {
      refusal = e.message;
    }
    await _load();
    if (!mounted) return;
    setState(() {
      _busyId = null;
      if (refusal == null) {
        _message = '${o.number} marked as delivered.';
      } else {
        _error = refusal;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final active = _active;
    if (active == null) {
      return _error == null
          ? const Center(child: CircularProgressIndicator())
          : EmptyState(icon: Icons.wifi_off, title: 'Could not load deliveries', message: _error, action: FilledButton(onPressed: _poller.now, child: const Text('Try again')));
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: Narrow(
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(12),
          children: [
            if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 10), child: Notice(_error!)),
            if (_message != null) Padding(padding: const EdgeInsets.only(bottom: 10), child: Notice(_message!, kind: NoticeKind.success)),
            if (active.isEmpty)
              const Panel(
                padding: EdgeInsets.all(28),
                child: Text('No orders are out for delivery right now. New ones appear here automatically.', textAlign: TextAlign.center, style: TextStyle(color: Brand.muted)),
              ),
            for (final o in active) Padding(padding: const EdgeInsets.only(bottom: 10), child: _card(o)),
            if (_recent.isNotEmpty) ...[
              const Padding(
                padding: EdgeInsets.fromLTRB(4, 10, 4, 8),
                child: Text('DELIVERED BY YOU IN THE LAST 24 HOURS', style: TextStyle(color: Brand.muted, fontSize: 11, fontWeight: FontWeight.w800)),
              ),
              Panel(
                child: Column(
                  children: [
                    for (final o in _recent) AmountRow('${o.number} · ${o.customerName}\n${when(o.deliveredAt)}', rs(o.total), color: Brand.ink),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _card(RiderOrder o) => Panel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(o.number, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
                      Text(o.customerName, style: const TextStyle(fontWeight: FontWeight.w700)),
                    ],
                  ),
                ),
                Text('Placed ${ago(o.placedAt)} ago', style: const TextStyle(color: Brand.muted, fontSize: 12)),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.location_on, color: Brand.red, size: 20),
                const SizedBox(width: 6),
                Expanded(
                  child: Text('${o.address}${o.distanceM == null ? '' : '\n${o.distanceM} m from the shop'}', style: const TextStyle(fontWeight: FontWeight.w600)),
                ),
              ],
            ),
            if (o.lat != null && o.lng != null) ...[
              const SizedBox(height: 10),
              FilledButton.icon(
                style: FilledButton.styleFrom(backgroundColor: Brand.ink),
                onPressed: () => openLink(context, directionsLink(o.lat!, o.lng!)),
                icon: const Icon(Icons.navigation_outlined, size: 18),
                label: const Text('Open in Maps'),
              ),
            ],
            if (o.specialInstructions != null) ...[const SizedBox(height: 10), Notice('Note: ${o.specialInstructions}', kind: NoticeKind.warning)],
            const Divider(height: 22),
            for (final i in o.items) AmountRow('${i.quantity} × ${i.title}${i.notes == null ? '' : '\n${i.notes}'}', rs(i.subtotal), color: Brand.ink),
            const Divider(height: 14),
            BillSummary(subtotal: o.subtotal, discount: o.discount, deliveryFee: o.deliveryFee, total: o.total),
            const SizedBox(height: 10),
            if (o.collectCash)
              Container(
                decoration: BoxDecoration(color: Brand.redSoft, borderRadius: BorderRadius.circular(12)),
                child: CheckboxListTile(
                  value: _collected.contains(o.id),
                  onChanged: (v) => setState(() => v == true ? _collected.add(o.id) : _collected.remove(o.id)),
                  controlAffinity: ListTileControlAffinity.leading,
                  title: Text('Collect ${rs(o.amountToCollect)} in cash', style: const TextStyle(color: Brand.red, fontWeight: FontWeight.w900)),
                  subtitle: const Text('I collected the cash'),
                ),
              )
            else
              Notice('Already paid (${paymentLabel(o.paymentMethod)}). Nothing to collect.', kind: NoticeKind.success),
            const SizedBox(height: 10),
            SizedBox(
              height: 54,
              child: BusyButton(
                busy: _busyId == o.id,
                color: Brand.green,
                icon: Icons.check_circle_outline,
                onPressed: o.collectCash && !_collected.contains(o.id) ? null : () => _deliver(o),
                label: 'Delivered${o.collectCash ? ' & cash received' : ''}',
              ),
            ),
          ],
        ),
      );
}
