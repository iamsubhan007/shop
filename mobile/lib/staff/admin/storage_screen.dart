import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:material_ui/material_ui.dart';

import '../../api/api_client.dart';
import '../../models/menu.dart' show maps;
import '../../theme.dart';
import '../../utils/format.dart';
import '../../widgets/common.dart';
import '../staff_api.dart';
import 'admin_common.dart';
import 'backup_report.dart';

String formatBytes(num n) {
  if (n < 1024) return '$n B';
  if (n < 1048576) return '${(n / 1024).toStringAsFixed(n < 10240 ? 1 : 0)} KB';
  if (n < 1073741824) return '${(n / 1048576).toStringAsFixed(n < 10485760 ? 1 : 0)} MB';
  return '${(n / 1073741824).toStringAsFixed(2)} GB';
}

/// How full the hosting plan is, backups (take, download, read) and clearing old payment screenshots.
class StorageScreen extends StatefulWidget {
  const StorageScreen({super.key});

  @override
  State<StorageScreen> createState() => _StorageScreenState();
}

class _StorageScreenState extends State<StorageScreen> {
  final _loaded = GlobalKey<LoadedState>();
  Map<String, dynamic>? _stats;
  int _days = 0;
  String _busy = '';

  @override
  void initState() {
    super.initState();
    _loadStats();
  }

  Future<void> _loadStats() async {
    try {
      final j = await StaffApi.of(context).get('/api/admin/storage/proofs', query: {'days': '$_days'});
      if (mounted) setState(() => _stats = j);
    } on ApiException {
      // The rest of the page still works; pulling down tries again.
    }
  }

  Future<void> _reload() async {
    await _loaded.currentState?.reload();
    if (mounted) await _loadStats();
  }

  Future<void> _backupNow() async {
    setState(() => _busy = 'backup');
    await act(context, (api) => api.post('/api/admin/backups', {}), done: 'Backup completed. You can download it below.');
    await _reload();
    if (mounted) setState(() => _busy = '');
  }

  Future<void> _deleteShots() async {
    final n = asNum(_stats?['removable']).toInt();
    if (n == 0) return;
    final older = _days > 0 ? ' placed more than $_days days ago' : '';
    if (!await confirm(context, 'Permanently delete the payment screenshots of $n order(s)$older? The orders and payment records stay; only the pictures are removed. This cannot be undone.', yes: 'Delete', no: 'Keep them', danger: true)) {
      return;
    }
    if (!mounted) return;
    setState(() => _busy = 'shots');
    var cleaned = 0;
    await act(context, (api) async {
      // The server deletes in batches; carry on until none are left.
      for (var i = 0; i < 50; i++) {
        final r = await api.post('/api/admin/storage/proofs', {'days': _days});
        cleaned += asNum(r['cleaned']).toInt();
        if (asNum(r['remaining']) == 0 || asNum(r['cleaned']) == 0) break;
      }
      return null;
    });
    if (mounted && cleaned > 0) toast(context, 'Deleted the payment screenshots of $cleaned order(s)');
    await _reload();
    if (mounted) setState(() => _busy = '');
  }

  Widget _meter(String title, Map<String, dynamic> m, num used) {
    final percent = m['percent'] == null ? null : asNum(m['percent']);
    final level = asNum(m['level']).toInt().clamp(0, 3);
    final color = [Brand.green, const Color(0xFFF59E0B), const Color(0xFFEA580C), Brand.red][level];
    final limit = asNum(m['limitMb']);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13))),
              Text(percent == null ? 'not measurable' : '$percent%', style: TextStyle(fontWeight: FontWeight.w900, color: percent == null ? Brand.muted : color)),
            ],
          ),
          const Gap(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(value: percent == null ? 0 : (percent / 100).clamp(0, 1).toDouble(), minHeight: 10, color: color, backgroundColor: const Color(0xFFF4F4F5)),
          ),
          if (percent != null) Muted('${formatBytes(used)} of ${limit >= 1024 && limit % 1024 == 0 ? '${limit ~/ 1024} GB' : '$limit MB'}'),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) => AdminPage(
        title: 'Storage & Backups',
        child: Loaded(
          '/api/admin/backups',
          key: _loaded,
          also: const ['/api/admin/storage'],
          builder: (context, data, reload) {
            final usage = data['usage'] as Map<String, dynamic>? ?? const {};
            final database = usage['database'] as Map<String, dynamic>? ?? const {};
            final files = usage['files'] as Map<String, dynamic>? ?? const {};
            final backups = maps(data['backups']);
            final removable = asNum(_stats?['removable']).toInt();
            final waiting = asNum(_stats?['waitingForReview']).toInt();
            return [
              Panel(
                title: 'How full is the plan?',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _meter('Database (orders, customers, menu)', database, asNum(database['bytes'])),
                    _meter('Files (screenshots, pictures, backups)', files, asNum(files['totalBytes'])),
                    for (final f in maps(files['folders'])) AmountRow('${f['label']}', '${f['count']} · ${formatBytes(asNum(f['bytes']))}'),
                    if (asNum(usage['level']) >= 1) const Notice('Download a backup now, then delete payment screenshots below. If a limit is reached, new orders or photo uploads can start to fail.', kind: NoticeKind.warning),
                    const Muted('Limits and warning emails are set in Shop Settings.'),
                  ],
                ),
              ),
              const Gap(),
              Panel(
                title: 'Backups',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    BusyButton(busy: _busy == 'backup', onPressed: _busy.isEmpty ? _backupNow : null, label: 'Back up now'),
                    const Gap(),
                    if (backups.isEmpty) const Muted('No backups yet.'),
                    for (final b in backups.take(15))
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        title: Text('${when(parseDate(b['createdAt']))} · ${b['trigger']}'),
                        subtitle: Text(
                          b['status'] == 'success' ? 'success${b['sizeBytes'] == null ? '' : ' (${formatBytes(asNum(b['sizeBytes']))})'}${b['available'] == false ? ' · older copy removed' : ''}' : 'failed: ${b['error'] ?? ''}',
                          style: TextStyle(color: b['status'] == 'success' ? Brand.green : Brand.red),
                        ),
                        trailing: b['status'] == 'success' && b['available'] != false
                            ? IconButton(
                                tooltip: 'Download backup',
                                onPressed: () => downloadAndSave(context, '/api/admin/backups/${b['id']}', fallbackName: 'hbt-backup.json.gz'),
                                icon: const Icon(Icons.download),
                              )
                            : null,
                      ),
                  ],
                ),
              ),
              const Gap(),
              Panel(
                title: 'Report from a saved backup',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Muted('Open a backup you downloaded earlier to see sales for any day, week or month. The file is read on this phone only.'),
                    const Gap(),
                    OutlinedButton.icon(onPressed: _openBackup, icon: const Icon(Icons.folder_open, size: 18), label: const Text('Open a backup file')),
                  ],
                ),
              ),
              const Gap(),
              Panel(
                title: 'Payment screenshots',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Muted('Once a payment is checked (or the order is finished) the picture only takes up space. Screenshots waiting for your payment check are never deleted.'),
                    const Gap(),
                    if (_stats == null)
                      const LinearProgressIndicator()
                    else ...[
                      Text('$removable order(s) with a screenshot that can be deleted${waiting > 0 ? ' · $waiting waiting for payment check (kept)' : ''}.'),
                      const Gap(),
                      DropdownButtonFormField<int>(
                        initialValue: _days,
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Orders placed'),
                        items: const [
                          DropdownMenuItem(value: 0, child: Text('at any time')),
                          DropdownMenuItem(value: 7, child: Text('more than 7 days ago')),
                          DropdownMenuItem(value: 30, child: Text('more than 30 days ago')),
                          DropdownMenuItem(value: 90, child: Text('more than 90 days ago')),
                        ],
                        onChanged: (v) {
                          setState(() => _days = v ?? 0);
                          _loadStats();
                        },
                      ),
                      const Gap(),
                      OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(foregroundColor: Brand.red),
                        onPressed: _busy.isEmpty && removable > 0 ? _deleteShots : null,
                        icon: const Icon(Icons.delete_outline, size: 18),
                        label: Text(_busy == 'shots' ? 'Deleting…' : 'Delete $removable screenshot(s)'),
                      ),
                    ],
                  ],
                ),
              ),
            ];
          },
        ),
      );

  Future<void> _openBackup() async {
    try {
      final file = await FilePicker.pickFile();
      if (file == null || !mounted) return;
      if ((await file.length() ?? 0) > 150 * 1048576) {
        if (mounted) fail(context, 'That file is too large to be a backup of this shop.');
        return;
      }
      final bytes = await file.readAsBytes();
      if (!mounted) return;
      final data = readBackup(bytes);
      await Navigator.push<void>(context, MaterialPageRoute(builder: (_) => BackupReportScreen(fileName: file.name, data: data)));
    } on FormatException catch (e) {
      if (mounted) fail(context, e.message);
    } catch (_) {
      if (mounted) fail(context, 'That file could not be opened.');
    }
  }
}

/// Day, week and month reports from an opened backup.
class BackupReportScreen extends StatefulWidget {
  const BackupReportScreen({super.key, required this.fileName, required this.data});

  final String fileName;
  final Map<String, dynamic> data;

  @override
  State<BackupReportScreen> createState() => _BackupReportScreenState();
}

class _BackupReportScreenState extends State<BackupReportScreen> {
  late final _info = backupInfo(widget.data);
  late String _date = _info.lastDay ?? shopToday();
  String _period = 'day';

  Future<void> _csv(Map<String, dynamic> report) async {
    final bytes = Uint8List.fromList(utf8.encode('\u{FEFF}${ordersToCsv(report)}'));
    final saved = await saveBytes('orders-$_period-$_date.csv', bytes);
    if (saved && mounted) toast(context, 'Saved');
  }

  @override
  Widget build(BuildContext context) {
    final report = buildReport(widget.data, period: _period, date: _date);
    final s = report['summary'] as Map<String, dynamic>;
    final feedback = report['feedback'] as Map<String, dynamic>;
    List<Map<String, dynamic>> rows(String key) => (report[key] as List).cast<Map<String, dynamic>>();
    AmountRow money(String label, String key, {bool bold = false}) => AmountRow(label, rs(s[key]), bold: bold);
    Widget bars(String title, String key, String label, String value, String Function(num)? format) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Panel(title: title, child: Bars([for (final r in rows(key)) ('${r[label]}', asNum(r[value]))], format: format, empty: 'Nothing in this period.')),
        );

    return AdminPage(
      title: 'Backup report',
      child: Narrow(
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            Muted('${widget.fileName} · ${_info.orders} orders${_info.firstDay == null ? '' : ', ${_info.firstDay} to ${_info.lastDay}'}'),
            const Gap(),
            SegmentedButton<String>(
              segments: const [ButtonSegment(value: 'day', label: Text('Day')), ButtonSegment(value: 'week', label: Text('Week')), ButtonSegment(value: 'month', label: Text('Month'))],
              selected: {_period},
              showSelectedIcon: false,
              onSelectionChanged: (v) => setState(() => _period = v.first),
            ),
            const Gap(height: 6),
            Row(
              children: [
                IconButton(tooltip: 'Previous', onPressed: () => setState(() => _date = shiftPeriod(_period, _date, -1)), icon: const Icon(Icons.chevron_left)),
                Expanded(child: DayButton(label: 'Date', value: _date, clearable: false, onChanged: (v) => setState(() => _date = v.isEmpty ? _date : v))),
                IconButton(tooltip: 'Next', onPressed: () => setState(() => _date = shiftPeriod(_period, _date, 1)), icon: const Icon(Icons.chevron_right)),
              ],
            ),
            const Gap(),
            Text('${report['label']}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
            const Gap(),
            Panel(
              title: 'Orders',
              child: Column(
                children: [
                  for (final (label, key) in const [('Received', 'received'), ('Completed', 'completed'), ('Cancelled / rejected', 'cancelled'), ('Still open when backed up', 'inProgress'), ('Pickup', 'pickup'), ('Delivery', 'delivery')])
                    AmountRow(label, '${s[key]}'),
                  money('Average order', 'averageOrder'),
                ],
              ),
            ),
            const Gap(),
            Panel(
              title: 'Sales and money',
              child: Column(
                children: [
                  money('Sales (cancelled left out)', 'gross', bold: true),
                  money('Bank transfers (verified)', 'bankVerified'),
                  money('JazzCash (verified)', 'jazzcashVerified'),
                  money('EasyPaisa (verified)', 'easypaisaVerified'),
                  money('COD collected', 'codCollected'),
                  money('Total collected', 'collected', bold: true),
                  money('Pending / unverified payments', 'pendingPayments'),
                  money('Outstanding COD', 'outstandingCod'),
                  money('Discounts given', 'discounts'),
                  money('Delivery fees', 'deliveryFees'),
                ],
              ),
            ),
            const Gap(),
            if (_period != 'day') bars('Day by day (sales)', 'byDay', 'day', 'sales', rs),
            bars('Best sellers', 'bestSellers', 'title', 'qty', (v) => '$v sold'),
            bars('Top by revenue', 'topRevenue', 'title', 'revenue', rs),
            bars('Categories', 'categories', 'title', 'revenue', rs),
            Panel(
              title: 'How customers paid',
              child: Column(children: [for (final p in rows('byPayment')) AmountRow('${paymentName('${p['method']}')} (${p['orders']})', rs(p['amount']))]),
            ),
            const Gap(),
            bars('Busiest hours', 'busiestHours', 'hour', 'orders', (v) => '$v orders'),
            Panel(
              title: 'Customer feedback',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(asNum(feedback['count']) == 0 ? 'No ratings for orders in this period.' : '${feedback['average']} / 5 from ${feedback['count']} rating(s)'),
                  for (final c in (feedback['comments'] as List).cast<Map<String, dynamic>>()) Muted('“${c['comment']}” ${c['rating']}★ · ${c['orderNumber']}'),
                ],
              ),
            ),
            const Gap(),
            OutlinedButton.icon(onPressed: () => _csv(report), icon: const Icon(Icons.download, size: 18), label: Text('Download CSV (${(report['orders'] as List).length} orders)')),
          ],
        ),
      ),
    );
  }
}

String paymentName(String method) => const {'cod': 'Cash on delivery', 'bank_transfer': 'Bank transfer', 'jazzcash': 'JazzCash', 'easypaisa': 'EasyPaisa'}[method] ?? method;
