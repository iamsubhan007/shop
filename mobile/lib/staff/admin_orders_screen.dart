import 'dart:async';

import 'package:material_ui/material_ui.dart';

import '../api/api_client.dart';
import '../models/menu.dart' show maps;
import '../models/order.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../utils/order_status.dart';
import '../widgets/common.dart';
import '../widgets/poller.dart';
import 'admin/admin_common.dart' show Pager;
import 'staff_api.dart';

/// Owner/admin order list with the website's search and filters.
class AdminOrdersScreen extends StatefulWidget {
  const AdminOrdersScreen({super.key, required this.onOpen});

  final Future<void> Function(String orderId) onOpen;

  @override
  State<AdminOrdersScreen> createState() => _AdminOrdersScreenState();
}

class _AdminOrdersScreenState extends State<AdminOrdersScreen> {
  final _search = TextEditingController();
  late final Poller _poller;
  Timer? _debounce;

  String _status = '';
  String _type = '';
  String _payment = '';
  DateTimeRange? _dates;
  int _page = 1;
  int _pages = 1;
  List<Order>? _orders;
  String? _error;
  int _request = 0;

  /// Finished orders ticked for deletion.
  final _selected = <String>{};

  @override
  void initState() {
    super.initState();
    // The last list shows at once while the new one loads.
    final before = StaffApi.of(context).peek('/api/admin/orders', query: const {'page': '1'});
    if (before != null) {
      _orders = maps(before['orders']).map(Order.new).toList();
      _pages = asNum(before['pages']).toInt();
    }
    _poller = Poller(const Duration(seconds: 15), _load);
  }

  @override
  void dispose() {
    _poller.dispose();
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  static String _day(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Future<void> _load() async {
    // Only the newest answer is shown: a slow older search must not overwrite a newer one.
    final request = ++_request;
    try {
      final j = await StaffApi.of(context).get('/api/admin/orders', query: {
        'page': '$_page',
        if (_search.text.trim().isNotEmpty) 'q': _search.text.trim(),
        if (_status.isNotEmpty) 'status': _status,
        if (_type.isNotEmpty) 'type': _type,
        if (_payment.isNotEmpty) 'payment': _payment,
        if (_dates != null) 'from': _day(_dates!.start),
        if (_dates != null) 'to': _day(_dates!.end),
      });
      if (!mounted || request != _request) return;
      setState(() {
        _orders = maps(j['orders']).map(Order.new).toList();
        _pages = asNum(j['pages']).toInt();
        _error = null;
      });
    } on ApiException catch (e) {
      if (mounted && request == _request) setState(() => _error = e.message);
    }
  }

  /// Runs a fresh search even if the timed refresh is already in flight.
  void _filter(VoidCallback change) {
    setState(() {
      change();
      _page = 1;
      _orders = null;
      _selected.clear();
    });
    _load();
  }

  Future<void> _deleteSelected() async {
    final n = _selected.length;
    if (!await confirm(context, 'Permanently delete $n finished order${n == 1 ? '' : 's'}? This cannot be undone. Their payment screenshots are removed too.', yes: 'Delete', no: 'Keep them', danger: true)) {
      return;
    }
    if (!mounted) return;
    try {
      final r = await StaffApi.of(context).post('/api/admin/orders/delete', {'ids': _selected.toList()});
      if (mounted) {
        toast(context, '${r['deleted']} order(s) deleted.');
        setState(_selected.clear);
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
    await _load();
  }

  Widget _dropdown(String value, String all, Map<String, String> options, ValueChanged<String> onChanged) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: DropdownButtonHideUnderline(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: value.isEmpty ? Colors.white : Brand.redSoft,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: value.isEmpty ? Brand.line : Brand.red),
            ),
            child: DropdownButton<String>(
              value: value,
              style: const TextStyle(color: Brand.ink, fontSize: 13),
              items: [
                DropdownMenuItem(value: '', child: Text(all)),
                for (final e in options.entries) DropdownMenuItem(value: e.key, child: Text(e.value)),
              ],
              onChanged: (v) => onChanged(v ?? ''),
            ),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final orders = _orders;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
          child: TextField(
            controller: _search,
            onChanged: (_) {
              _debounce?.cancel();
              _debounce = Timer(const Duration(milliseconds: 350), () => _filter(() {}));
            },
            decoration: const InputDecoration(hintText: 'Order #, name or phone', prefixIcon: Icon(Icons.search)),
          ),
        ),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(
            children: [
              _dropdown(_status, 'All statuses', {for (final s in orderStatuses) s: s}, (v) => _filter(() => _status = v)),
              _dropdown(_type, 'Pickup & delivery', const {'pickup': 'Pickup', 'delivery': 'Delivery'}, (v) => _filter(() => _type = v)),
              _dropdown(_payment, 'All payments', paymentLabels, (v) => _filter(() => _payment = v)),
              OutlinedButton.icon(
                onPressed: () async {
                  final now = DateTime.now();
                  final picked = await showDateRangePicker(
                    context: context,
                    firstDate: DateTime(2024),
                    lastDate: DateTime(now.year, now.month, now.day),
                    initialDateRange: _dates,
                  );
                  if (picked != null && mounted) _filter(() => _dates = picked);
                },
                icon: const Icon(Icons.date_range, size: 17),
                label: Text(_dates == null ? 'Any date' : '${_day(_dates!.start)} – ${_day(_dates!.end)}'),
              ),
              if (_dates != null)
                IconButton(tooltip: 'Clear dates', onPressed: () => _filter(() => _dates = null), icon: const Icon(Icons.close)),
            ],
          ),
        ),
        if (_error != null) Padding(padding: const EdgeInsets.fromLTRB(12, 8, 12, 0), child: Notice(_error!)),
        Expanded(
          child: orders == null
              ? (_error == null ? const Center(child: CircularProgressIndicator()) : const SizedBox.shrink())
              : RefreshIndicator(
                  onRefresh: _load,
                  child: Narrow(
                    maxWidth: 760,
                    child: ListView(
                      padding: const EdgeInsets.all(12),
                      children: [
                        if (orders.isEmpty)
                          const Padding(
                            padding: EdgeInsets.only(top: 40),
                            child: Text('No orders match. New orders will appear here automatically.', textAlign: TextAlign.center, style: TextStyle(color: Brand.muted)),
                          ),
                        if (orders.any((o) => terminalStatuses.contains(o.status)))
                          Wrap(
                            spacing: 8,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              TextButton(
                                onPressed: () => setState(() => _selected.addAll(orders.where((o) => terminalStatuses.contains(o.status)).map((o) => o.id))),
                                child: const Text('Select all finished'),
                              ),
                              if (_selected.isNotEmpty) ...[
                                TextButton(onPressed: () => setState(_selected.clear), child: const Text('Clear')),
                                FilledButton.icon(
                                  onPressed: _deleteSelected,
                                  icon: const Icon(Icons.delete_outline, size: 17),
                                  label: Text('Delete ${_selected.length} selected'),
                                ),
                              ],
                            ],
                          ),
                        for (final o in orders)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: terminalStatuses.contains(o.status)
                                ? Row(
                                    children: [
                                      Checkbox(
                                        value: _selected.contains(o.id),
                                        semanticLabel: 'Select ${o.number} for deletion',
                                        onChanged: (v) => setState(() => v == true ? _selected.add(o.id) : _selected.remove(o.id)),
                                      ),
                                      Expanded(child: _card(o)),
                                    ],
                                  )
                                : _card(o),
                          ),
                        Pager(
                          page: _page,
                          pages: _pages,
                          onPage: (p) {
                            setState(() {
                              _page = p;
                              _selected.clear();
                            });
                            _load();
                          },
                        ),
                      ],
                    ),
                  ),
                ),
        ),
      ],
    );
  }

  Widget _card(Order o) => Panel(
        padding: EdgeInsets.zero,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () async {
            await widget.onOpen(o.id);
            if (mounted) await _load(); // keeps the filters and page, shows what changed
          },
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(child: Text(o.number, style: const TextStyle(fontWeight: FontWeight.w800))),
                    StatusChip(o.status),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  '${o.customerName} · ${o.customerPhone} · ${o.type} · ${paymentLabel(o.paymentMethod)} (${readable(o.paymentStatus)}) · ${ago(o.createdAt)} ago',
                  style: const TextStyle(color: Brand.muted, fontSize: 12),
                ),
                const SizedBox(height: 4),
                Text(o.itemsText, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5)),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Text(rs(o.total), style: const TextStyle(fontWeight: FontWeight.w900)),
                    if (o.feedbackRating != null) ...[
                      const SizedBox(width: 10),
                      Text('★ ${o.feedbackRating}/5', style: const TextStyle(color: Color(0xFFD97706), fontWeight: FontWeight.w700, fontSize: 12)),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ),
      );
}
