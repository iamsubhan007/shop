import 'package:material_ui/material_ui.dart';

import '../../models/menu.dart' show maps;
import '../../theme.dart';
import '../../utils/format.dart';
import '../../widgets/common.dart';
import 'admin_common.dart';

/// Daily closing, product sales compared with the previous period, and data downloads.
class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  String _day = shopToday();
  String _from = '';
  String _to = '';

  Map<String, String> get _range => {if (_from.isNotEmpty) 'from': _from, if (_to.isNotEmpty) 'to': _to};

  @override
  Widget build(BuildContext context) => DefaultTabController(
        length: 3,
        child: AdminPage(
          title: 'Reports',
          child: Column(
            children: [
              const Material(
                color: Colors.white,
                child: TabBar(tabs: [Tab(text: 'Daily closing'), Tab(text: 'Product sales'), Tab(text: 'Downloads')]),
              ),
              Expanded(child: TabBarView(children: [_closing(), _analytics(), _downloads()])),
            ],
          ),
        ),
      );

  Widget _closing() => Loaded(
        '/api/admin/closing',
        query: {'date': _day},
        builder: (context, data, reload) {
          final c = data['report'] as Map<String, dynamic>? ?? const {};
          final closed = c['closed'] as Map<String, dynamic>?;
          Widget row(String label, Object? value, {bool bold = false}) => AmountRow(label, '${value ?? 0}', bold: bold);
          return [
            DayButton(label: 'Day', value: _day, clearable: false, onChanged: (v) => setState(() => _day = v.isEmpty ? shopToday() : v)),
            const Gap(),
            Panel(
              title: 'Orders',
              child: Column(
                children: [
                  row('Received', c['received']),
                  row('Completed', c['completed']),
                  row('Cancelled / rejected', c['cancelled']),
                  row('Pickup', c['pickup']),
                  row('Delivery', c['delivery']),
                  row('Cash on delivery (live)', c['cod_orders']),
                ],
              ),
            ),
            const Gap(),
            Panel(
              title: 'Money collected',
              child: Column(
                children: [
                  row('Bank transfers (verified)', rs(c['bank_verified'])),
                  row('JazzCash (verified)', rs(c['jazzcash_verified'])),
                  row('EasyPaisa (verified)', rs(c['easypaisa_verified'])),
                  row('COD collected', rs(c['cod_collected'])),
                  row('Total collected', rs(c['collected']), bold: true),
                  const Divider(height: 18),
                  row('Pending / unverified payments', rs(c['pending_payments'])),
                  row('Outstanding COD', rs(c['outstanding_cod'])),
                  row('Discounts given', rs(c['discounts'])),
                ],
              ),
            ),
            const Gap(),
            Panel(title: 'Best sellers', child: Bars([for (final b in maps(c['bestSellers'])) ('${b['title']}', asNum(b['qty']))], format: (v) => '$v sold', empty: 'No sales on this day.')),
            const Gap(),
            if (closed != null) ...[Notice('Closed on ${when(parseDate(closed['closedAt']))}. Run closing again to refresh the summary.', kind: NoticeKind.success), const Gap()],
            FilledButton(
              onPressed: () async {
                if (!await confirm(context, 'Close $_day? This saves a summary. Orders are not locked or changed.', yes: 'Close day', no: 'Back')) return;
                if (!context.mounted) return;
                await act(context, (api) => api.post('/api/admin/closing', {'date': _day}), done: 'Day closed and summary saved');
                await reload();
              },
              child: const Text('Close this day'),
            ),
            const Gap(),
            OutlinedButton.icon(
              onPressed: () => downloadAndSave(context, '/api/admin/closing', query: {'date': _day, 'format': 'pdf'}, fallbackName: 'hbt-closing-$_day.pdf'),
              icon: const Icon(Icons.picture_as_pdf_outlined, size: 18),
              label: const Text('Download PDF'),
            ),
          ];
        },
      );

  Widget _dates() => Wrap(
        spacing: 8,
        children: [
          DayButton(label: 'From', value: _from, onChanged: (v) => setState(() => _from = v)),
          DayButton(label: 'To', value: _to, onChanged: (v) => setState(() => _to = v)),
          if (_from.isNotEmpty || _to.isNotEmpty)
            TextButton(
              onPressed: () => setState(() {
                _from = '';
                _to = '';
              }),
              child: const Text('Last 30 days'),
            ),
        ],
      );

  Widget _analytics() => Loaded(
        '/api/admin/analytics',
        query: _range,
        builder: (context, data, reload) {
          final comparison = data['comparison'] as Map<String, dynamic>? ?? const {};
          final now = comparison['current'] as Map<String, dynamic>? ?? const {};
          final before = comparison['previous'] as Map<String, dynamic>? ?? const {};
          final change = asNum(before['revenue']) > 0 ? ((asNum(now['revenue']) - asNum(before['revenue'])) / asNum(before['revenue']) * 100).round() : null;
          Widget bars(String title, String key, String label, String value, [String Function(num)? format]) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Panel(title: title, child: Bars([for (final r in maps(data[key])) ('${r[label]}', asNum(r[value]))], format: format, empty: 'No sales in this period.')),
              );
          return [
            _dates(),
            const Gap(),
            Panel(
              child: Text(
                'This period: ${now['qty'] ?? 0} items, ${rs(now['revenue'])}\n'
                'Previous period: ${before['qty'] ?? 0} items, ${rs(before['revenue'])}${change == null ? '' : ' ($change%)'}',
                style: TextStyle(height: 1.5, color: change != null && change < 0 ? Brand.red : Brand.ink),
              ),
            ),
            const Gap(),
            bars('Most ordered', 'mostOrdered', 'title', 'qty'),
            bars('Least ordered (that sold)', 'leastOrdered', 'title', 'qty'),
            bars('Revenue by product', 'revenueByProduct', 'title', 'revenue', rs),
            bars('Category performance', 'categories', 'category', 'revenue', rs),
            Panel(
              title: 'Top items: this vs previous period',
              child: Column(
                children: [for (final p in maps(comparison['perProduct'])) AmountRow('${p['title']}', '${p['qty']} vs ${p['previousQty']}', color: Brand.ink)],
              ),
            ),
          ];
        },
      );

  Widget _downloads() => ListView(
        padding: const EdgeInsets.all(12),
        children: [
          _dates(),
          const Gap(),
          const Muted('Default: last 30 days. These files contain customer details, so keep them private.'),
          const Gap(),
          for (final (type, label) in const [('orders', 'All orders'), ('customers', 'Customers'), ('revenue', 'Revenue by day'), ('payments', 'Payments'), ('products', 'Product sales')])
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Panel(
                title: label,
                child: Wrap(
                  spacing: 8,
                  children: [
                    for (final (format, name) in const [('xlsx', 'Excel'), ('csv', 'CSV'), ('pdf', 'PDF')])
                      OutlinedButton(
                        onPressed: () => downloadAndSave(context, '/api/admin/export', query: {'type': type, 'format': format, ..._range}, fallbackName: 'hbt-$type.$format'),
                        child: Text(name),
                      ),
                  ],
                ),
              ),
            ),
        ],
      );
}
