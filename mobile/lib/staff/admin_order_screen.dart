import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models/menu.dart' show maps;
import '../models/order.dart';
import '../state/auth_state.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../utils/order_status.dart';
import '../widgets/common.dart';
import '../widgets/poller.dart';
import 'admin/admin_common.dart' show downloadAndSave;
import 'staff_api.dart';

/// One order for the owner/admin: accept and move it, check payments, edit items, timer, discount, cancel, delete.
class AdminOrderScreen extends StatefulWidget {
  const AdminOrderScreen({super.key, required this.orderId});

  final String orderId;

  @override
  State<AdminOrderScreen> createState() => _AdminOrderScreenState();
}

class _AdminOrderScreenState extends State<AdminOrderScreen> {
  final _note = TextEditingController();
  final _etaMinutes = TextEditingController();
  final _discount = TextEditingController();
  final _discountNote = TextEditingController();
  final _scroll = ScrollController();
  late final Poller _poller;
  final _proofs = <String, Future<Uint8List>>{};

  Order? _order;
  String? _error;
  String? _info;
  bool _busy = false;
  String _discountType = 'amount';

  /// The answer to "Remind customer": what was emailed and the WhatsApp link.
  Map<String, dynamic>? _reminder;

  @override
  void initState() {
    super.initState();
    _poller = Poller(const Duration(seconds: 20), _load);
  }

  @override
  void dispose() {
    _poller.dispose();
    _note.dispose();
    _etaMinutes.dispose();
    _discount.dispose();
    _discountNote.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final j = await StaffApi.of(context).get('/api/admin/orders/${widget.orderId}');
      if (mounted) setState(() => _order = Order(j['order'] as Map<String, dynamic>));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  void _say({String? error, String? info}) {
    setState(() {
      _error = error;
      _info = info;
    });
    if (_scroll.hasClients) _scroll.animateTo(0, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
  }

  /// Sends one change to the order, then reloads it. [done] turns the server's answer into a confirmation line.
  Future<bool> _change(Map<String, dynamic> body, {String Function(Map<String, dynamic>)? done}) async {
    if (_busy) return false;
    setState(() {
      _busy = true;
      _error = null;
      _info = null;
    });
    var ok = false;
    try {
      final j = await StaffApi.of(context).patch('/api/admin/orders/${widget.orderId}', body);
      ok = true;
      if (mounted && done != null) _say(info: done(j));
    } on ApiException catch (e) {
      if (mounted) _say(error: e.message);
    }
    await _load();
    if (mounted) setState(() => _busy = false);
    return ok;
  }

  Future<void> _move(Order o, String status) async {
    final note = _note.text.trim();
    if (status == 'Cancelled') {
      if (note.isEmpty) return _say(error: 'Please write a reason in the note box before cancelling.');
      if (!await confirm(context, 'Really cancel this order? Stock is put back.', yes: 'Cancel order', no: 'Keep it', danger: true)) return;
    } else if (status == 'Completed' && !['Ready for Pickup', 'Out for Delivery'].contains(o.status)) {
      if (!await confirm(context, 'Mark this order as completed even though it is "${o.status}"?')) return;
    }
    if (await _change({'action': 'status', 'status': status, if (note.isNotEmpty) 'note': note})) _note.clear();
  }

  Future<void> _rejectPayment() async {
    final reason = await showDialog<String>(context: context, builder: (_) => const _ReasonDialog());
    if (reason != null && reason.isNotEmpty) await _change({'action': 'payment', 'decision': 'reject', 'notes': reason});
  }

  Future<void> _remind(Order o) async {
    final email = o.customerEmail.isEmpty ? '' : ' An email goes to ${o.customerEmail}, and you can also send it on WhatsApp.';
    if (!await confirm(context, 'Remind ${o.customerName} about this payment?$email', yes: 'Send reminder', no: 'Back')) return;
    setState(() => _reminder = null);
    await _change(
      {'action': 'remind_payment'},
      done: (j) {
        _reminder = j;
        return '${switch (j['email']) {
          'sent' => 'Reminder emailed to ${j['emailTo']}.',
          'failed' => 'The email could not be sent; use WhatsApp.',
          'recent' => 'An email went a few minutes ago, so no new one was sent.',
          _ => 'This order has no email address; use WhatsApp.',
        }} The customer is now asked to pay or send proof.';
      },
    );
  }

  Future<void> _setEta(int? minutes) async {
    FocusScope.of(context).unfocus();
    final ok = await _change(
      {'action': 'eta', 'minutes': minutes},
      done: (_) => minutes == null ? 'Timer cleared.' : 'Timer set: $minutes min. The customer can see the time left.',
    );
    if (ok) _etaMinutes.clear();
  }

  Future<void> _applyDiscount({bool clear = false}) async {
    FocusScope.of(context).unfocus();
    final value = clear ? 0 : num.tryParse(_discount.text.trim()) ?? 0;
    if (!clear && value <= 0) return _say(error: 'Enter a discount greater than 0.');
    final note = _discountNote.text.trim();
    final ok = await _change(
      {'action': 'discount', 'type': _discountType, 'value': value, if (note.isNotEmpty) 'note': note},
      done: (j) =>
          '${clear ? 'Discount removed' : 'Discount saved'}. New total ${rs(j['totalAmount'])}.${j['paymentNote'] == null ? '' : ' ${j['paymentNote']}'}',
    );
    if (ok) {
      _discount.clear();
      _discountNote.clear();
    }
  }

  Future<void> _editItems(Order o) async {
    final changes = await Navigator.push<Map<String, dynamic>>(
      context,
      MaterialPageRoute(builder: (_) => _EditItemsScreen(order: o)),
    );
    if (changes == null) return;
    await _change(
      {'action': 'items', ...changes},
      done: (j) => 'Order updated. New total ${rs(j['totalAmount'])}.${j['paymentNote'] == null ? '' : ' ${j['paymentNote']}'}',
    );
  }

  Future<void> _delete(Order o) async {
    if (!await confirm(context, 'Permanently delete ${o.number}? This cannot be undone. Its payment screenshot is removed too.', yes: 'Delete', no: 'Keep it', danger: true)) {
      return;
    }
    if (!mounted) return;
    setState(() => _busy = true);
    final navigator = Navigator.of(context);
    try {
      await StaffApi.of(context).post('/api/admin/orders/delete', {'ids': [o.id]});
      navigator.pop();
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        _say(error: e.message);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = _order;
    // Signing out (or an expired session) leaves nothing to show here.
    if (context.watch<StaffState>().user == null) {
      return Scaffold(appBar: AppBar(), body: const EmptyState(icon: Icons.lock_outline, title: 'Please sign in again'));
    }
    return Scaffold(
      appBar: AppBar(
        title: Text(o?.number ?? 'Order'),
        actions: [
          if (o != null)
            IconButton(
              tooltip: 'Receipt PDF',
              onPressed: () => downloadAndSave(context, '/api/admin/orders/${o.id}/receipt', fallbackName: '${o.number}.pdf'),
              icon: const Icon(Icons.picture_as_pdf_outlined),
            ),
        ],
      ),
      body: o == null
          ? (_error == null
              ? const Center(child: CircularProgressIndicator())
              : EmptyState(icon: Icons.error_outline, title: 'Could not load the order', message: _error, action: FilledButton(onPressed: _poller.now, child: const Text('Try again'))))
          : Narrow(
              child: SingleChildScrollView(
                controller: _scroll,
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final section in _sections(o)) Padding(padding: const EdgeInsets.only(bottom: 10), child: section),
                  ],
                ),
              ),
            ),
    );
  }

  List<Widget> _sections(Order o) {
    final live = !terminalStatuses.contains(o.status);
    final actions = adminStatusActions(status: o.status, orderType: o.type, paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus);
    final hasProof = o.proofFile != null || o.payments.any((p) => p.proofFile != null);

    return [
      Row(
        children: [
          StatusChip(o.status),
          const SizedBox(width: 10),
          Expanded(child: Text(when(o.createdAt), style: const TextStyle(color: Brand.muted, fontSize: 12.5))),
        ],
      ),
      if (_error != null) Notice(_error!),
      if (_info != null) Notice(_info!, kind: NoticeKind.success),
      _customer(o),
      Panel(
        title: 'Items',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final i in o.items) AmountRow('${i.quantity} × ${i.title}${i.notes == null ? '' : '\n${i.notes}'}', rs(i.subtotal), color: Brand.ink),
            const Divider(height: 18),
            BillSummary(subtotal: o.subtotal, discount: o.discount, deliveryFee: o.deliveryFee, total: o.total),
            if (live) ...[
              const SizedBox(height: 8),
              OutlinedButton.icon(onPressed: _busy ? null : () => _editItems(o), icon: const Icon(Icons.edit, size: 17), label: const Text('Edit items')),
            ],
          ],
        ),
      ),
      if (o.feedback != null)
        Notice(
          'Customer feedback: ${'★' * o.feedback!.rating}${'☆' * (5 - o.feedback!.rating)} (${o.feedback!.rating}/5)'
          '${o.feedback!.comment == null ? '' : '\n${o.feedback!.comment}'}',
          kind: NoticeKind.warning,
          icon: Icons.reviews_outlined,
        ),
      if (actions.isNotEmpty) _moveTo(o, actions),
      _payment(o, live: live, hasProof: hasProof),
      if (live) _timer(o),
      if (live) _discountPanel(o),
      if (o.waText.isNotEmpty)
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => openLink(context, whatsappLink('', o.waText)),
                icon: const Icon(Icons.share, size: 17, color: Brand.green),
                label: const Text('Share on WhatsApp'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: o.waText));
                  if (mounted) toast(context, 'Order text copied');
                },
                icon: const Icon(Icons.copy, size: 17),
                label: const Text('Copy order text'),
              ),
            ),
          ],
        ),
      if (o.json['whatsappConfigured'] == true)
        Panel(
          title: 'Owner WhatsApp notification: ${(o.json['notification'] as Map?)?['status'] ?? 'none'}',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if ((o.json['notification'] as Map?)?['lastError'] != null) Notice('${(o.json['notification'] as Map)['lastError']}'),
              OutlinedButton(onPressed: _busy ? null : () => _change({'action': 'retry_notification'}), child: const Text('Retry sending')),
            ],
          ),
        ),
      if (!live)
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(foregroundColor: Brand.red),
          onPressed: _busy ? null : () => _delete(o),
          icon: const Icon(Icons.delete_outline, size: 18),
          label: const Text('Delete this order'),
        ),
      Panel(
        title: 'History',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final h in o.history)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text('${when(h.at)} — ${h.to}${h.note == null ? '' : ' (${h.note})'}', style: const TextStyle(color: Brand.muted, fontSize: 12)),
              ),
          ],
        ),
      ),
    ];
  }

  Widget _customer(Order o) => Panel(
        title: o.customerName,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SelectableText('${o.customerPhone} · ${o.customerEmail}', style: const TextStyle(fontSize: 13)),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => openLink(context, Uri(scheme: 'tel', path: o.customerPhone)),
                    icon: const Icon(Icons.call, size: 17),
                    label: const Text('Call'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => openLink(context, whatsappLink(o.customerPhone, 'Hello ${o.customerName}, this is Haq Bahu Tandoor about order ${o.number}.')),
                    icon: const Icon(Icons.chat_outlined, size: 17, color: Brand.green),
                    label: const Text('WhatsApp'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (o.isDelivery) ...[
              Text('Deliver to: ${o.address}${o.distanceM == null ? '' : ' (${o.distanceM} m)'}'),
              if (o.lat != null && o.lng != null)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: () => openLink(context, directionsLink(o.lat!, o.lng!)),
                    icon: const Icon(Icons.map_outlined, size: 17),
                    label: const Text('Open in Maps'),
                  ),
                ),
            ] else
              const Text('Customer will pick up'),
            if (o.specialInstructions != null) ...[const SizedBox(height: 8), Notice('Note: ${o.specialInstructions}', kind: NoticeKind.warning)],
          ],
        ),
      );

  Widget _moveTo(Order o, List<String> actions) => Panel(
        title: 'Move order to',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(controller: _note, maxLength: 300, decoration: const InputDecoration(hintText: 'Note (required to cancel)', counterText: '')),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final s in actions)
                  s == 'Cancelled'
                      ? OutlinedButton(
                          style: OutlinedButton.styleFrom(foregroundColor: Brand.red),
                          onPressed: _busy ? null : () => _move(o, s),
                          child: const Text('Cancel order'),
                        )
                      : FilledButton(
                          onPressed: _busy ? null : () => _move(o, s),
                          child: Text(s == 'Confirmed'
                              ? 'Accept order'
                              : (s == 'Completed' && !['Ready for Pickup', 'Out for Delivery'].contains(o.status) ? 'Mark completed' : s)),
                        ),
              ],
            ),
          ],
        ),
      );

  Widget _payment(Order o, {required bool live, required bool hasProof}) {
    final proofFiles = <String>{...o.payments.map((p) => p.proofFile).whereType<String>(), ?o.proofFile};
    final reviewing = o.paymentStatus == 'submitted' && live;
    return Panel(
      title: 'Payment',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('${paymentLabel(o.paymentMethod)} — ${readable(o.paymentStatus)}', style: const TextStyle(fontWeight: FontWeight.w700)),
          if (o.paymentMethod == 'cod')
            const Text('Cash is collected by the rider; it is marked collected when you complete the order.', style: TextStyle(color: Brand.muted, fontSize: 12)),
          for (final p in o.payments)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: SelectableText('Ref: ${p.reference} · ${p.status}${p.adminNotes == null ? '' : ' · ${p.adminNotes}'}', style: const TextStyle(fontSize: 12.5)),
            ),
          for (final file in proofFiles) ...[const SizedBox(height: 8), _proof(file)],
          if (hasProof) ...[
            const SizedBox(height: 8),
            if (reviewing)
              const Text('Check this payment first (received or reject). After that you can delete the screenshot to free storage space.', style: TextStyle(color: Brand.muted, fontSize: 11.5))
            else
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(foregroundColor: Brand.red),
                onPressed: _busy
                    ? null
                    : () async {
                        if (await confirm(context, 'Permanently delete this payment screenshot? The order and its payment record stay; only the picture is removed.', yes: 'Delete', no: 'Keep it', danger: true)) {
                          await _change({'action': 'deleteProof'});
                        }
                      },
                icon: const Icon(Icons.delete_outline, size: 17),
                label: const Text('Delete payment screenshot'),
              ),
          ],
          if (o.paymentStatus == 'submitted') ...[
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: FilledButton(
                    style: FilledButton.styleFrom(backgroundColor: Brand.green),
                    onPressed: _busy
                        ? null
                        : () async {
                            if (await confirm(context, 'Mark this payment as received and confirm the order?')) {
                              await _change({'action': 'payment', 'decision': 'verify'});
                            }
                          },
                    child: const Text('Payment received ✓'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(foregroundColor: Brand.red),
                    onPressed: _busy ? null : _rejectPayment,
                    child: const Text('Reject'),
                  ),
                ),
              ],
            ),
          ],
          if (paymentUnconfirmed(o.paymentMethod, o.paymentStatus, o.status)) ...[
            const SizedBox(height: 10),
            if (o.paymentStatus != 'submitted') ...[
              const Text(
                'No transaction ID or screenshot has been sent. If you have checked yourself that the money arrived, you can confirm without it.',
                style: TextStyle(color: Brand.muted, fontSize: 12),
              ),
              const SizedBox(height: 8),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: Brand.green),
                onPressed: _busy
                    ? null
                    : () async {
                        if (await confirm(context, 'Confirm this payment without proof? Only do this if you have seen the money arrive.', yes: 'Confirm', no: 'Back')) {
                          await _change({'action': 'payment', 'decision': 'manual'}, done: (_) => 'Payment confirmed and the order accepted.');
                        }
                      },
                child: const Text('Payment received — confirm order'),
              ),
              const SizedBox(height: 8),
            ],
            OutlinedButton.icon(
              onPressed: _busy ? null : () => _remind(o),
              icon: const Icon(Icons.notifications_active_outlined, size: 17),
              label: const Text('Remind customer about payment'),
            ),
            if (_reminder?['whatsappUrl'] != null) ...[
              const SizedBox(height: 8),
              FilledButton.icon(
                style: FilledButton.styleFrom(backgroundColor: Brand.green),
                onPressed: () => openLink(context, Uri.parse('${_reminder!['whatsappUrl']}')),
                icon: const Icon(Icons.chat_outlined, size: 17),
                label: const Text('Send it on WhatsApp too'),
              ),
            ],
          ],
        ],
      ),
    );
  }

  /// Screenshots are private, so they are fetched with the staff session instead of by a plain image link.
  Widget _proof(String file) {
    final future = _proofs[file] ??= context.read<ApiClient>().getBytes('/api/files/proof/$file', session: Session.staff);
    return FutureBuilder<Uint8List>(
      future: future,
      builder: (context, snapshot) {
        if (snapshot.hasError) return const Notice('The screenshot could not be loaded.', kind: NoticeKind.info);
        final bytes = snapshot.data;
        if (bytes == null) return const SizedBox(height: 60, child: Center(child: CircularProgressIndicator()));
        return InkWell(
          onTap: () => Navigator.push<void>(
            context,
            MaterialPageRoute(
              builder: (_) => Scaffold(
                backgroundColor: Colors.black,
                appBar: AppBar(title: const Text('Payment screenshot')),
                body: InteractiveViewer(maxScale: 6, child: Center(child: Image.memory(bytes))),
              ),
            ),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: Image.memory(bytes, height: 220, fit: BoxFit.contain, semanticLabel: 'Payment proof'),
          ),
        );
      },
    );
  }

  Widget _timer(Order o) {
    final eta = o.etaAt;
    final left = eta == null ? null : minutesLeft(eta);
    return Panel(
      title: 'Timer for the customer${left == null ? '' : (left > 0 ? ' ($left min left)' : ' (time is up)')}',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final m in [10, 15, 20, 30, 45, 60]) OutlinedButton(onPressed: _busy ? null : () => _setEta(m), child: Text('$m min')),
              if (eta != null) TextButton(onPressed: _busy ? null : () => _setEta(null), child: const Text('Clear')),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _etaMinutes,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: const InputDecoration(hintText: 'Other minutes'),
                ),
              ),
              const SizedBox(width: 8),
              OutlinedButton(
                onPressed: _busy
                    ? null
                    : () {
                        final m = int.tryParse(_etaMinutes.text) ?? 0;
                        m >= 1 && m <= 480 ? _setEta(m) : _say(error: 'Enter between 1 and 480 minutes.');
                      },
                child: const Text('Set'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _discountPanel(Order o) => Panel(
        title: 'Discount on this order${o.manualDiscount > 0 ? ' (now ${rs(o.manualDiscount)})' : ''}',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                SegmentedButton<String>(
                  segments: const [ButtonSegment(value: 'amount', label: Text('Rs.')), ButtonSegment(value: 'percent', label: Text('%'))],
                  selected: {_discountType},
                  showSelectedIcon: false,
                  onSelectionChanged: (v) => setState(() => _discountType = v.first),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _discount,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: InputDecoration(hintText: _discountType == 'percent' ? 'percent' : 'amount'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            TextField(controller: _discountNote, maxLength: 200, decoration: const InputDecoration(hintText: 'Reason (optional)', counterText: '')),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: FilledButton(onPressed: _busy ? null : _applyDiscount, child: const Text('Apply'))),
                if (o.manualDiscount > 0) TextButton(onPressed: _busy ? null : () => _applyDiscount(clear: true), child: const Text('Remove')),
              ],
            ),
            const SizedBox(height: 4),
            const Text('It comes off the items (not the delivery fee). A new one replaces the previous admin discount.', style: TextStyle(color: Brand.muted, fontSize: 11)),
          ],
        ),
      );
}

class _ReasonDialog extends StatefulWidget {
  const _ReasonDialog();

  @override
  State<_ReasonDialog> createState() => _ReasonDialogState();
}

class _ReasonDialogState extends State<_ReasonDialog> {
  final _text = TextEditingController();

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Why is the payment rejected?'),
        content: TextField(
          controller: _text,
          autofocus: true,
          maxLength: 300,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(hintText: 'The customer can resubmit'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Back')),
          FilledButton(
            onPressed: _text.text.trim().isEmpty ? null : () => Navigator.pop(context, _text.text.trim()),
            child: const Text('Reject payment'),
          ),
        ],
      );
}

/// Change quantities (0 removes a line) or add products. Returns the body for the `items` change, or nothing.
class _EditItemsScreen extends StatefulWidget {
  const _EditItemsScreen({required this.order});

  final Order order;

  @override
  State<_EditItemsScreen> createState() => _EditItemsScreenState();
}

class _EditItemsScreenState extends State<_EditItemsScreen> {
  final _note = TextEditingController();
  late final Map<String, int> _quantities = {for (final i in widget.order.items) i.id: i.quantity};

  /// (product id, name, quantity)
  final _added = <(String, String, int)>[];
  List<Map<String, dynamic>>? _products;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadProducts();
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _loadProducts() async {
    try {
      final j = await StaffApi.of(context).get('/api/admin/products');
      if (mounted) setState(() => _products = maps(j['products']));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  void _save() {
    final changes = [
      for (final i in widget.order.items)
        if (_quantities[i.id] != i.quantity) {'itemId': i.id, 'quantity': _quantities[i.id]},
    ];
    if (changes.isEmpty && _added.isEmpty) {
      Navigator.pop(context);
      return;
    }
    Navigator.pop(context, <String, dynamic>{
      'changes': changes,
      'add': [for (final a in _added) {'productId': a.$1, 'quantity': a.$3}],
      if (_note.text.trim().isNotEmpty) 'note': _note.text.trim(),
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text('Edit ${widget.order.number}')),
        body: Narrow(
          child: ListView(
            padding: const EdgeInsets.all(12),
            children: [
              if (_error != null) Notice(_error!),
              const Text('Set a quantity to 0 to remove an item.', style: TextStyle(color: Brand.muted, fontSize: 12)),
              for (final i in widget.order.items)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(i.title),
                  subtitle: Text('${rs(i.unitPrice)} each'),
                  trailing: QuantityStepper(value: _quantities[i.id]!, min: 0, onChanged: (q) => setState(() => _quantities[i.id] = q)),
                ),
              for (var k = 0; k < _added.length; k++)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.add_circle, color: Brand.green),
                  title: Text(_added[k].$2),
                  trailing: QuantityStepper(
                    value: _added[k].$3,
                    min: 0,
                    onChanged: (q) => setState(() => q == 0 ? _added.removeAt(k) : _added[k] = (_added[k].$1, _added[k].$2, q)),
                  ),
                ),
              const SizedBox(height: 8),
              if (_products == null && _error == null)
                const LinearProgressIndicator()
              else if (_products != null)
                DropdownMenu<String>(
                  expandedInsets: EdgeInsets.zero,
                  hintText: 'Add an item…',
                  enableFilter: true,
                  requestFocusOnTap: true,
                  menuHeight: 320,
                  dropdownMenuEntries: [
                    for (final p in _products!) DropdownMenuEntry(value: '${p['id']}', label: '${p['name']} — ${rs(p['price'])}'),
                  ],
                  onSelected: (id) {
                    if (id == null || _added.any((a) => a.$1 == id)) return;
                    final p = _products!.firstWhere((x) => '${x['id']}' == id);
                    setState(() => _added.add((id, '${p['name']}', 1)));
                  },
                ),
              const SizedBox(height: 12),
              TextField(controller: _note, maxLength: 200, decoration: const InputDecoration(hintText: 'Reason (optional)', counterText: '')),
              const SizedBox(height: 12),
              FilledButton(onPressed: _save, child: const Text('Save changes')),
              const SizedBox(height: 8),
              const Text(
                'The total is recalculated. The delivery fee and any coupon discount stay as they were. Stock is adjusted for items that track it.',
                style: TextStyle(color: Brand.muted, fontSize: 11),
              ),
            ],
          ),
        ),
      );
}
