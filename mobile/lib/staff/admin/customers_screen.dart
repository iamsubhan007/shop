import 'dart:async';

import 'package:material_ui/material_ui.dart';

import '../../models/menu.dart' show maps;
import '../../utils/format.dart';
import '../../widgets/common.dart';
import 'admin_common.dart';

/// Customers and coupons.
class CustomersScreen extends StatelessWidget {
  const CustomersScreen({super.key});

  @override
  Widget build(BuildContext context) => const DefaultTabController(
        length: 2,
        child: AdminPage(
          title: 'Customers & Coupons',
          child: Column(
            children: [
              Material(color: Colors.white, child: TabBar(tabs: [Tab(text: 'Customers'), Tab(text: 'Coupons')])),
              Expanded(child: TabBarView(children: [_Customers(), _Coupons()])),
            ],
          ),
        ),
      );
}

class _Customers extends StatefulWidget {
  const _Customers();

  @override
  State<_Customers> createState() => _CustomersState();
}

class _CustomersState extends State<_Customers> {
  final _search = TextEditingController();
  Timer? _debounce;
  String _q = '';

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
            child: TextField(
              controller: _search,
              onChanged: (v) {
                _debounce?.cancel();
                _debounce = Timer(const Duration(milliseconds: 350), () => setState(() => _q = v.trim()));
              },
              decoration: const InputDecoration(hintText: 'Name, email or phone', prefixIcon: Icon(Icons.search)),
            ),
          ),
          Expanded(
            child: Loaded(
              '/api/admin/customers',
              query: {'q': _q},
              builder: (context, data, reload) {
                final customers = maps(data['customers']);
                return [
                  if (customers.isEmpty) const Panel(child: Muted('No customers found.')),
                  for (final c in customers)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Panel(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text('${c['full_name'] ?? '—'}${c['repeat'] == true ? '  · repeat' : ''}', style: const TextStyle(fontWeight: FontWeight.w800)),
                            Muted('${c['email']}${c['phone'] == null ? '' : ' · ${c['phone']}'}'),
                            Muted('Completed ${c['completed']} · spent ${rs(c['spent'])} · points ${c['loyalty_points'] ?? 0} · joined ${when(parseDate(c['created_at']))}'),
                          ],
                        ),
                      ),
                    ),
                ];
              },
            ),
          ),
        ],
      );
}

class _Coupons extends StatefulWidget {
  const _Coupons();

  @override
  State<_Coupons> createState() => _CouponsState();
}

class _CouponsState extends State<_Coupons> {
  final _code = TextEditingController();
  final _value = TextEditingController();
  final _min = TextEditingController(text: '0');
  final _uses = TextEditingController();
  String _kind = 'percent';
  DateTime? _ends;

  @override
  void dispose() {
    for (final c in [_code, _value, _min, _uses]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _add(Future<void> Function() reload) async {
    final value = num.tryParse(_value.text.trim());
    if (_code.text.trim().length < 3 || value == null || value < 1) return fail(context, 'Enter a code of 3 or more letters and an amount.');
    FocusScope.of(context).unfocus();
    final ok = await act(
      context,
      (api) => api.post('/api/admin/coupons', {
        'code': _code.text.trim().toUpperCase(),
        'kind': _kind,
        'value': value,
        'minOrder': num.tryParse(_min.text.trim()) ?? 0,
        'maxUses': int.tryParse(_uses.text.trim()),
        'endsAt': _ends?.toUtc().toIso8601String(),
      }),
      done: 'Coupon added',
    );
    if (ok && mounted) {
      for (final c in [_code, _value, _uses]) {
        c.clear();
      }
      setState(() => _ends = null);
    }
    await reload();
  }

  @override
  Widget build(BuildContext context) => Loaded(
        '/api/admin/coupons',
        builder: (context, data, reload) {
          final coupons = maps(data['coupons']);
          return [
            Panel(
              title: 'New coupon',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Muted('Coupons only exist when you create them here. Customers type the code at checkout.'),
                  const Gap(),
                  Field('Code', _code, max: 30),
                  SegmentedButton<String>(
                    segments: const [ButtonSegment(value: 'percent', label: Text('% off')), ButtonSegment(value: 'fixed', label: Text('Rs. off'))],
                    selected: {_kind},
                    showSelectedIcon: false,
                    onSelectionChanged: (v) => setState(() => _kind = v.first),
                  ),
                  const Gap(),
                  Field('Amount', _value, number: true),
                  Row(
                    children: [
                      Expanded(child: Field('Min order', _min, number: true)),
                      const SizedBox(width: 8),
                      Expanded(child: Field('Max uses', _uses, number: true)),
                    ],
                  ),
                  ShopDateTimeField(label: 'Ends (optional)', value: _ends, onChanged: (v) => setState(() => _ends = v)),
                  const Gap(),
                  FilledButton(onPressed: () => _add(reload), child: const Text('Add coupon')),
                ],
              ),
            ),
            const Gap(),
            if (coupons.isEmpty) const Panel(child: Muted('No coupons yet.')),
            for (final x in coupons)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Panel(
                  padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
                  child: SwitchRow(
                    '${x['code']} · ${x['kind'] == 'percent' ? '${x['value']}% off' : '${rs(x['value'])} off'}',
                    x['isActive'] == true,
                    (_) async {
                      await act(context, (api) => api.patch('/api/admin/coupons/${x['id']}', {'isActive': x['isActive'] != true}));
                      await reload();
                    },
                    hint: '${asNum(x['minOrder']) > 0 ? 'min ${rs(x['minOrder'])} · ' : ''}used ${x['usedCount']}${x['maxUses'] == null ? '' : '/${x['maxUses']}'}'
                        '${x['endsAt'] == null ? '' : ' · until ${when(parseDate(x['endsAt']))}'}',
                  ),
                ),
              ),
          ];
        },
      );
}
