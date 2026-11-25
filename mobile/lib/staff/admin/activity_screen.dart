import 'dart:convert';

import 'package:material_ui/material_ui.dart';

import '../../models/menu.dart' show maps;
import '../../utils/format.dart';
import '../../widgets/common.dart';
import 'admin_common.dart';

const _actions = {
  'order.status': 'Order status changed',
  'order.items': 'Order items changed',
  'order.discount': 'Order discount',
  'order.eta': 'Order timer',
  'order.delete': 'Order deleted',
  'payment.verify': 'Payment verified',
  'payment.reject': 'Payment rejected',
  'payment.verify_manual': 'Payment confirmed without proof',
  'payment.remind': 'Payment reminder sent',
  'product.create': 'Product added',
  'product.price': 'Price changed',
  'product.availability': 'Availability changed',
  'product.delete': 'Product deleted',
  'inventory.adjust': 'Stock adjusted',
  'deal.create': 'Deal added',
  'deal.update': 'Deal changed',
  'deal.delete': 'Deal deleted',
  'coupon.create': 'Coupon added',
  'coupon.toggle': 'Coupon switched',
  'day.close': 'Day closed',
  'backup.run': 'Backup taken',
  'backup.download': 'Backup downloaded',
  'export': 'Data exported',
  'staff.login': 'Staff signed in',
  'staff.add': 'Staff added',
  'staff.role': 'Staff role changed',
  'staff.remove': 'Staff access removed',
};

/// Who did what (owner only).
class ActivityScreen extends StatefulWidget {
  const ActivityScreen({super.key});

  @override
  State<ActivityScreen> createState() => _ActivityScreenState();
}

class _ActivityScreenState extends State<ActivityScreen> {
  int _page = 1;

  @override
  Widget build(BuildContext context) => AdminPage(
        title: 'Activity',
        child: Loaded(
          '/api/admin/audit',
          query: {'page': '$_page'},
          builder: (context, data, reload) {
            final logs = maps(data['logs']);
            return [
              if (logs.isEmpty) const Panel(child: Muted('Nothing recorded yet.')),
              for (final l in logs)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Panel(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(_actions[l['action']] ?? '${l['action']}', style: const TextStyle(fontWeight: FontWeight.w700)),
                        Muted('${when(parseDate(l['createdAt']))} · ${l['actorEmail'] ?? 'system'}${l['entityId'] == null ? '' : ' · ${l['entity']}: ${_short('${l['entityId']}', 24)}'}'),
                        if (l['before'] != null || l['after'] != null)
                          Muted(_short('${l['before'] == null ? '' : 'before ${jsonEncode(l['before'])} '}${l['after'] == null ? '' : '→ ${jsonEncode(l['after'])}'}', 300)),
                      ],
                    ),
                  ),
                ),
              Pager(page: _page, pages: asNum(data['pages']).toInt(), onPage: (p) => setState(() => _page = p)),
            ];
          },
        ),
      );
}

String _short(String v, int max) => v.length <= max ? v : '${v.substring(0, max)}…';
