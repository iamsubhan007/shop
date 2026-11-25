import 'package:material_ui/material_ui.dart';

import '../../models/menu.dart' show maps;
import '../../theme.dart';
import '../../utils/format.dart';
import '../../utils/order_status.dart';
import '../../widgets/common.dart';
import '../staff_api.dart';
import 'admin_common.dart';
import 'storage_screen.dart';

/// The website's dashboard: orders and money for a period (default: the last 30 days).
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  String _from = '';
  String _to = '';
  Map<String, dynamic>? _usage;

  @override
  void initState() {
    super.initState();
    _checkStorage();
  }

  /// Shows the same "storage is getting full" warning as the website's admin pages.
  Future<void> _checkStorage() async {
    try {
      final j = await StaffApi.of(context).get('/api/admin/storage');
      if (mounted && j['usage'] is Map<String, dynamic>) setState(() => _usage = j['usage'] as Map<String, dynamic>);
    } catch (_) {
      // Only a warning: never gets in the way.
    }
  }

  @override
  Widget build(BuildContext context) => Loaded(
        '/api/admin/stats',
        query: {if (_from.isNotEmpty) 'from': _from, if (_to.isNotEmpty) 'to': _to},
        builder: (context, data, reload) {
          final t = data['totals'] as Map<String, dynamic>? ?? const {};
          final daily = maps(data['daily']);
          final lastDays = daily.length > 14 ? daily.sublist(daily.length - 14) : daily;
          final level = asNum(_usage?['level']);
          return [
            if (level >= 1) ...[
              Notice(
                '${level >= 3 ? 'Storage almost full' : 'Storage getting full'}. Download a backup and free some space.',
                kind: level >= 3 ? NoticeKind.error : NoticeKind.warning,
                action: TextButton(
                  onPressed: () => Navigator.push<void>(context, MaterialPageRoute(builder: (_) => const StorageScreen())),
                  child: const Text('Open'),
                ),
              ),
              const Gap(),
            ],
            Wrap(
              spacing: 8,
              runSpacing: 4,
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
            ),
            const Gap(height: 4),
            const Muted('Cancelled and unpaid orders are never counted as collected money.'),
            const Gap(),
            StatGrid([
              StatCard('Orders (period)', '${t['total'] ?? 0}'),
              StatCard('Orders today', '${t['today'] ?? 0}'),
              StatCard('Open / in progress', '${t['pending'] ?? 0}', color: const Color(0xFFD97706)),
              StatCard('Completed', '${t['completed'] ?? 0}', color: Brand.green),
              StatCard('Cancelled / rejected', '${t['cancelled'] ?? 0}'),
              StatCard('Money collected', rs(t['collected']), hint: 'Verified payments + COD collected', color: Brand.green),
              StatCard('Collected today', rs(t['collected_today'])),
              StatCard('Waiting to be collected', rs(t['pending_amount']), hint: 'Unverified + COD not delivered', color: const Color(0xFFD97706)),
              StatCard('Verified prepaid', rs(t['verified_prepaid'])),
              StatCard('COD collected', rs(t['cod_collected'])),
              StatCard('Gross order value', rs(t['gross']), hint: 'All non-cancelled orders'),
              StatCard('Average order', rs(t['avgOrder'])),
            ]),
            Panel(title: 'Daily money collected', child: Bars([for (final d in lastDays) ('${d['day']}', asNum(d['revenue']))], format: rs)),
            const Gap(),
            Panel(title: 'Daily order volume', child: Bars([for (final d in lastDays) ('${d['day']}', asNum(d['orders']))])),
            const Gap(),
            Panel(title: 'Orders by status', child: Bars([for (final d in maps(data['byStatus'])) ('${d['status']}', asNum(d['n']))])),
            const Gap(),
            Panel(title: 'Payment methods', child: Bars([for (final d in maps(data['byPayment'])) (readable('${d['method']}'), asNum(d['n']))])),
            const Gap(),
            Panel(title: 'Best-selling items', child: Bars([for (final d in maps(data['topProducts'])) ('${d['title']}', asNum(d['qty']))], format: (v) => '$v sold')),
          ];
        },
      );
}
