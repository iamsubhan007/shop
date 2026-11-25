import 'package:material_ui/material_ui.dart';

import '../api/api_client.dart';
import '../models/menu.dart' show maps;
import '../theme.dart';
import '../utils/format.dart';
import '../widgets/poller.dart';
import 'alarm.dart';
import 'staff_api.dart';

/// Rings for as long as any order is waiting to be accepted, like the website's staff panel. There is no dismiss
/// button on purpose: it stops only when the order is accepted or cancelled. Folding it does not silence it.
class NewOrderAlert extends StatefulWidget {
  const NewOrderAlert({super.key, required this.onOpen, this.alarm});

  final void Function(String orderId) onOpen;
  final Alarm? alarm;

  @override
  State<NewOrderAlert> createState() => _NewOrderAlertState();
}

class _NewOrderAlertState extends State<NewOrderAlert> {
  late final Alarm _alarm = widget.alarm ?? SoundAlarm();
  late final Poller _poller;

  List<Map<String, dynamic>> _orders = const [];
  int _count = 0;
  int _failures = 0;
  bool _open = true;
  String? _busyId;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Keeps checking in the background too, so a phone left on the counter still rings.
    _poller = Poller(const Duration(seconds: 5), _poll, keepInBackground: true);
  }

  @override
  void dispose() {
    _poller.dispose();
    _alarm.dispose();
    super.dispose();
  }

  Future<void> _poll() async {
    try {
      final j = await StaffApi.of(context).get('/api/admin/alerts');
      if (!mounted) return;
      final count = asNum(j['count']).toInt();
      setState(() {
        if (count > _count) _open = true;
        _count = count;
        _orders = maps(j['orders']);
        _failures = 0;
      });
      count > 0 ? await _alarm.start() : await _alarm.stop();
    } on ApiException {
      if (mounted) setState(() => _failures++);
    }
  }

  Future<void> _accept(String id) async {
    setState(() {
      _busyId = id;
      _error = null;
    });
    try {
      await StaffApi.of(context).patch('/api/admin/orders/$id', {'action': 'status', 'status': 'Confirmed'});
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
    await _poller.now();
    if (mounted) setState(() => _busyId = null);
  }

  @override
  Widget build(BuildContext context) {
    final offline = _failures >= 3
        ? Container(
            width: double.infinity,
            color: Brand.ink,
            padding: const EdgeInsets.all(8),
            child: const Text(
              "Can't check for new orders right now. Check the internet connection.",
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600),
            ),
          )
        : null;
    if (_count == 0) return offline ?? const SizedBox.shrink();

    const white = TextStyle(color: Colors.white);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ?offline,
        Material(
          color: Brand.red,
          shape: const Border(top: BorderSide(color: Brand.amber, width: 4)),
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.45),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  InkWell(
                    onTap: () => setState(() => _open = !_open),
                    child: Row(
                      children: [
                        const Icon(Icons.notifications_active, color: Colors.white),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _count == 1 ? 'NEW ORDER' : '$_count ORDERS WAITING',
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 17),
                          ),
                        ),
                        Text(_open ? 'Fold' : 'Show', style: white),
                        Icon(_open ? Icons.expand_more : Icons.expand_less, color: Colors.white),
                      ],
                    ),
                  ),
                  if (_open) ...[
                    for (final o in _orders.take(3)) _row(o),
                    if (_count > 3) Text('+ ${_count - 3} more waiting', style: const TextStyle(color: Color(0xFFFEE2E2), fontSize: 12)),
                    if (_error != null)
                      Container(
                        margin: const EdgeInsets.only(top: 6),
                        padding: const EdgeInsets.all(8),
                        color: Colors.white,
                        child: Text(_error!, style: const TextStyle(color: Brand.red, fontSize: 12)),
                      ),
                    const Padding(
                      padding: EdgeInsets.only(top: 6),
                      child: Text('This alert stops when the order is accepted or cancelled.', style: TextStyle(color: Color(0xFFFEE2E2), fontSize: 11)),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _row(Map<String, dynamic> o) {
    final id = '${o['id']}';
    final canAccept = o['canAccept'] == true;
    final items = asNum(o['itemCount']).toInt();
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: Colors.white12, borderRadius: BorderRadius.circular(12)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text('${o['orderNumber']}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900))),
              Text('${ago(parseDate(o['createdAt']))} ago', style: const TextStyle(color: Color(0xFFFEE2E2), fontSize: 12)),
            ],
          ),
          Text(
            '${o['customerName']} · ${o['orderType'] == 'delivery' ? 'Delivery' : 'Pickup'} · $items item${items == 1 ? '' : 's'}'
            '${o['totalAmount'] == null ? '' : ' · ${rs(o['totalAmount'])}'}',
            style: const TextStyle(color: Colors.white, fontSize: 12),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: canAccept
                    ? FilledButton(
                        style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: Brand.red),
                        onPressed: _busyId == id ? null : () => _accept(id),
                        child: Text(_busyId == id ? 'Accepting…' : 'Accept order'),
                      )
                    : const Text('Payment submitted. Check it, then accept.', style: TextStyle(color: Colors.white, fontSize: 12)),
              ),
              const SizedBox(width: 8),
              OutlinedButton(
                style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Colors.white54)),
                onPressed: () => widget.onOpen(id),
                child: Text(canAccept ? 'Open' : 'Review payment'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
