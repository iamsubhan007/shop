import 'package:material_ui/material_ui.dart';

import '../../models/menu.dart' show maps;
import '../../theme.dart';
import '../../utils/format.dart';
import '../../widgets/common.dart';
import 'admin_common.dart';
import 'menu_admin_screen.dart' show PhotoField;

/// Deals: list, switch on and off, add, edit and delete.
class DealsAdminScreen extends StatefulWidget {
  const DealsAdminScreen({super.key});

  @override
  State<DealsAdminScreen> createState() => _DealsAdminScreenState();
}

class _DealsAdminScreenState extends State<DealsAdminScreen> {
  final _loaded = GlobalKey<LoadedState>();
  List<Map<String, dynamic>> _products = [];

  Future<void> _reload() async => _loaded.currentState?.reload();

  Future<void> _edit(Map<String, dynamic>? deal) async {
    final saved = await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => DealForm(deal: deal, products: _products)));
    if (saved == true) await _reload();
  }

  Future<void> _delete(Map<String, dynamic> d) async {
    if (!await confirm(context, 'Delete deal "${d['title']}"?', yes: 'Delete', no: 'Keep it', danger: true)) return;
    if (!mounted) return;
    await act(context, (api) => api.delete('/api/admin/deals/${d['id']}'), done: 'Deleted');
    await _reload();
  }

  @override
  Widget build(BuildContext context) => AdminPage(
        title: 'Deals',
        floating: FloatingActionButton.extended(onPressed: () => _edit(null), icon: const Icon(Icons.add), label: const Text('Add deal')),
        child: Loaded(
          '/api/admin/deals',
          key: _loaded,
          also: const ['/api/admin/products'],
          builder: (context, data, reload) {
            final deals = maps(data['deals']);
            _products = maps(data['products']);
            return [
              if (deals.isEmpty) const Panel(child: Muted('No deals yet.')),
              for (final d in deals)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Panel(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text('${d['title']}${d['isFeatured'] == true ? '  ★ featured' : ''}', style: const TextStyle(fontWeight: FontWeight.w800)),
                        Muted(
                          '${rs(d['price'])}${d['originalPrice'] == null ? '' : ' (value ${rs(d['originalPrice'])})'} · '
                          '${d['items'] is List && (d['items'] as List).isNotEmpty ? (d['items'] as List).join(', ') : 'no items listed'}'
                          '${d['endsAt'] == null ? '' : ' · ends ${when(parseDate(d['endsAt']))}'}',
                        ),
                        Row(
                          children: [
                            FilterChip(
                              label: const Text('Active'),
                              selected: d['isActive'] != false,
                              onSelected: (v) async {
                                await act(context, (api) => api.patch('/api/admin/deals/${d['id']}', {'isActive': v}));
                                await _reload();
                              },
                            ),
                            const Spacer(),
                            TextButton(onPressed: () => _edit(d), child: const Text('Edit')),
                            IconButton(tooltip: 'Delete ${d['title']}', onPressed: () => _delete(d), icon: const Icon(Icons.delete_outline, color: Brand.red)),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              const Gap(height: 70),
            ];
          },
        ),
      );
}

class DealForm extends StatefulWidget {
  const DealForm({super.key, required this.deal, required this.products});

  final Map<String, dynamic>? deal;
  final List<Map<String, dynamic>> products;

  @override
  State<DealForm> createState() => _DealFormState();
}

class _DealFormState extends State<DealForm> {
  late final Map<String, dynamic> d = widget.deal ?? const {};
  late final _title = TextEditingController(text: '${d['title'] ?? ''}');
  late final _description = TextEditingController(text: '${d['description'] ?? ''}');
  late final _price = TextEditingController(text: d['price'] == null ? '' : '${asNum(d['price']).round()}');
  late final _badge = TextEditingController(text: '${d['badge'] ?? ''}');
  late String? _image = d['imageUrl'] as String?;
  late bool _featured = d['isFeatured'] == true;
  late bool _active = d['isActive'] != false;
  late DateTime? _starts = parseDate(d['startsAt']);
  late DateTime? _ends = parseDate(d['endsAt']);

  /// (product id, quantity)
  late final List<(String, int)> _parts = [for (final p in maps(d['parts'])) ('${p['productId']}', asNum(p['quantity']).toInt())];
  bool _busy = false;

  bool get _isNew => widget.deal == null;

  @override
  void dispose() {
    for (final c in [_title, _description, _price, _badge]) {
      c.dispose();
    }
    super.dispose();
  }

  num get _value => _parts.fold<num>(0, (sum, p) {
        final product = widget.products.where((x) => '${x['id']}' == p.$1).firstOrNull;
        return sum + asNum(product?['price']) * p.$2;
      });

  Future<void> _save() async {
    final price = num.tryParse(_price.text.trim());
    if (_title.text.trim().isEmpty || price == null || price <= 0) return fail(context, 'Deal name and price are required.');
    final body = <String, dynamic>{
      'title': _title.text.trim(),
      'description': _description.text.trim().isEmpty ? null : _description.text.trim(),
      'price': price,
      'badge': _badge.text.trim().isEmpty ? null : _badge.text.trim(),
      'imageUrl': _image,
      'isFeatured': _featured,
      'isActive': _active,
      'startsAt': _starts?.toUtc().toIso8601String(),
      'endsAt': _ends?.toUtc().toIso8601String(),
      'items': [for (final p in _parts) {'productId': p.$1, 'quantity': p.$2}],
    };
    setState(() => _busy = true);
    final navigator = Navigator.of(context);
    final ok = await act(context, (api) => _isNew ? api.post('/api/admin/deals', body) : api.patch('/api/admin/deals/${d['id']}', body), done: 'Saved');
    if (ok) {
      navigator.pop(true);
    } else if (mounted) {
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final value = _value;
    final price = num.tryParse(_price.text.trim());
    return AdminPage(
      title: _isNew ? 'Add deal' : 'Edit deal',
      child: Narrow(
        child: ListView(
          padding: const EdgeInsets.all(14),
          children: [
            Field('Deal name', _title, max: 120),
            Field('Description', _description, lines: 2, max: 600),
            Panel(
              title: 'What is included',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (var i = 0; i < _parts.length; i++)
                    Row(
                      key: ValueKey('part-${_parts[i].$1}'),
                      children: [
                        Expanded(child: Text(widget.products.where((x) => '${x['id']}' == _parts[i].$1).map((x) => '${x['name']}').firstOrNull ?? 'Item no longer on the menu')),
                        QuantityStepper(
                          value: _parts[i].$2,
                          min: 0,
                          onChanged: (q) => setState(() => q == 0 ? _parts.removeAt(i) : _parts[i] = (_parts[i].$1, q)),
                        ),
                      ],
                    ),
                  const Gap(height: 6),
                  DropdownMenu<String>(
                    key: ValueKey(_parts.length),
                    expandedInsets: EdgeInsets.zero,
                    hintText: 'Add an item…',
                    enableFilter: true,
                    requestFocusOnTap: true,
                    menuHeight: 300,
                    dropdownMenuEntries: [
                      for (final p in widget.products)
                        if (!_parts.any((x) => x.$1 == '${p['id']}')) DropdownMenuEntry(value: '${p['id']}', label: '${p['name']} (${rs(p['price'])})'),
                    ],
                    onSelected: (id) {
                      if (id != null) setState(() => _parts.add((id, 1)));
                    },
                  ),
                  if (_parts.isNotEmpty) ...[
                    const Gap(height: 6),
                    Muted('Value if bought separately: ${rs(value)}${price != null && value > price ? ' · customer saves ${rs(value - price)}' : ''}'),
                  ],
                ],
              ),
            ),
            const Gap(),
            Row(
              children: [
                Expanded(child: Field('Deal price (Rs.)', _price, number: true, onChanged: (_) => setState(() {}))),
                const SizedBox(width: 8),
                Expanded(child: Field('Badge (optional)', _badge, max: 30)),
              ],
            ),
            ShopDateTimeField(label: 'Starts (shop time)', value: _starts, onChanged: (v) => setState(() => _starts = v)),
            const Gap(),
            ShopDateTimeField(label: 'Ends (shop time)', value: _ends, onChanged: (v) => setState(() => _ends = v)),
            const Gap(),
            PhotoField(url: _image, onChanged: (u) => setState(() => _image = u)),
            SwitchRow('Featured', _featured, (v) => setState(() => _featured = v)),
            SwitchRow('Active', _active, (v) => setState(() => _active = v)),
            const Gap(),
            BusyButton(busy: _busy, onPressed: _save, label: 'Save'),
          ],
        ),
      ),
    );
  }
}
