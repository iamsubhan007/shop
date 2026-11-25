import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models/order.dart';
import '../state/auth_state.dart';
import '../state/site_state.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../utils/order_status.dart';
import '../widgets/common.dart';
import '../widgets/order_progress.dart';
import '../widgets/payment_proof.dart';
import '../widgets/poller.dart';
import 'checkout_screen.dart' show PaymentAccountDetails;

/// Live order tracking for the customer who placed it.
class OrderDetailScreen extends StatefulWidget {
  const OrderDetailScreen({super.key, required this.orderId, this.justPlaced = false});

  final String orderId;
  final bool justPlaced;

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  final _reference = TextEditingController();
  final _comment = TextEditingController();
  late final Poller _poller;

  Order? _order;
  Map<String, dynamic>? _instructions;
  String? _loadError;
  String? _message;
  String? _proofFile;
  bool _busy = false;
  bool _notFound = false;
  int _stars = 0;
  bool _editFeedback = false;

  @override
  void initState() {
    super.initState();
    _poller = Poller(const Duration(seconds: 20), _load);
    _loadInstructions();
  }

  @override
  void dispose() {
    _poller.dispose();
    _reference.dispose();
    _comment.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final api = context.read<ApiClient>();
    try {
      final j = await api.get('/api/orders/${widget.orderId}', session: Session.customer);
      if (mounted) {
        setState(() {
          _order = Order(j['order'] as Map<String, dynamic>);
          _loadError = null;
          _notFound = false;
        });
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _notFound = e.status == 404;
          _loadError = e.message;
        });
      }
    }
  }

  Future<void> _loadInstructions() async {
    try {
      final j = await context.read<ApiClient>().get('/api/settings', session: Session.customer, query: {'payment': '1'});
      final p = j['paymentInstructions'];
      if (mounted && p is Map<String, dynamic>) setState(() => _instructions = p);
    } on ApiException {
      // Offered again with a button.
    }
  }

  Future<void> _act(String path, Map<String, dynamic> body, {VoidCallback? done}) async {
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      await context.read<ApiClient>().post(path, session: Session.customer, body: body);
      done?.call();
    } on ApiException catch (e) {
      if (mounted) setState(() => _message = e.message);
    }
    // Loaded directly: the timed refresh skips a turn if one is already running.
    if (mounted) await _load();
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final order = _order;
    return Scaffold(
      appBar: AppBar(title: Text(order?.number ?? 'Your order')),
      body: order == null
          ? (_loadError == null
              ? const Center(child: CircularProgressIndicator())
              : EmptyState(
                  icon: _notFound ? Icons.search_off : Icons.wifi_off,
                  title: _notFound ? 'Order not found' : 'Could not load the order',
                  message: _notFound ? 'Sign in with the account you ordered with.' : _loadError,
                  action: FilledButton(onPressed: _poller.now, child: const Text('Try again')),
                ))
          : RefreshIndicator(
              onRefresh: _load,
              child: Narrow(
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: _sections(context, order),
                ),
              ),
            ),
    );
  }

  List<Widget> _sections(BuildContext context, Order order) {
    final user = context.watch<AuthState>().user;
    final settings = context.watch<SiteState>().settings;
    final mine = user != null && order.userId == user.id;
    final dead = order.status == 'Cancelled' || order.status == 'Rejected';
    final canPay = mine && (order.canSubmitPayment ?? (order.paymentMethod != 'cod' && order.status == 'Payment Pending'));
    final reminded = !dead && order.paymentReminderAt != null;
    const gap = SizedBox(height: 12);

    return [
      if (widget.justPlaced) ...[
        Notice(
          'Thank you! Your order ${order.number} has been received.'
          '${order.status == 'Payment Pending' ? ' Please send your payment and submit the details below so we can confirm it.' : ''}',
          kind: NoticeKind.success,
        ),
        gap,
      ],
      Row(
        children: [
          Expanded(child: Text(when(order.createdAt), style: const TextStyle(color: Brand.muted, fontSize: 13))),
          StatusChip(order.status),
        ],
      ),
      gap,
      if (_loadError != null) ...[Notice(_loadError!, kind: NoticeKind.warning), gap],
      if (reminded) ...[
        Notice(
          'We have not received your payment of ${rs(order.total)} yet. Please send it. If you have already sent it, '
          '${canPay ? 'add a proof of payment (screenshot or transaction ID) below.' : 'sign in with the account you ordered with to add a proof of payment.'}',
          icon: Icons.payments_outlined,
        ),
        gap,
        if (canPay) ...[_paymentForm(order), gap],
      ],
      if (order.etaAt != null && !dead) ...[OrderProgressHero(order: order), gap],
      Panel(
        title: 'Progress',
        child: dead
            ? Notice('This order was ${order.status.toLowerCase()}.${order.cancelReason == null ? '' : ' Reason: ${order.cancelReason}'}')
            : _Timeline(order: order),
      ),
      gap,
      Panel(
        title: 'Items',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final i in order.items) AmountRow('${i.quantity} × ${i.title}', rs(i.subtotal), color: Brand.ink),
            const Divider(height: 18),
            BillSummary(subtotal: order.subtotal, discount: order.discount, deliveryFee: order.deliveryFee, total: order.total),
            const SizedBox(height: 8),
            Text(
              '${order.isDelivery ? 'Delivery to: ${order.address}' : 'Pickup from the shop'}\n'
              '${paymentLabel(order.paymentMethod)} · payment: ${readable(order.paymentStatus)}',
              style: const TextStyle(color: Brand.muted, fontSize: 12.5, height: 1.4),
            ),
          ],
        ),
      ),
      if (canPay && !reminded) ...[gap, _paymentForm(order)],
      if (mine && order.status == 'Completed') ...[gap, _feedbackForm(order)],
      if (_message != null) ...[gap, Notice(_message!)],
      gap,
      if (mine && customerCancellable.contains(order.status)) ...[
        OutlinedButton(
          onPressed: _busy
              ? null
              : () async {
                  if (!await confirm(context, 'Cancel this order?', yes: 'Cancel order', no: 'Keep it', danger: true)) return;
                  await _act('/api/orders/${order.id}/cancel', {});
                },
          child: const Text('Cancel order'),
        ),
        const SizedBox(height: 8),
      ],
      if (settings != null && settings.whatsapp.isNotEmpty)
        FilledButton.icon(
          style: FilledButton.styleFrom(backgroundColor: Brand.green),
          onPressed: () => openLink(context, whatsappLink(settings.whatsapp, 'Hello Haq Bahu Tandoor, I need help with my order ${order.number}.')),
          icon: const Icon(Icons.chat_outlined, size: 18),
          label: const Text('Ask about this order on WhatsApp'),
        ),
    ];
  }

  Widget _paymentForm(Order order) => Panel(
        title: order.paymentStatus == 'submitted' ? 'Send proof of payment' : 'Submit your payment details',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (order.paymentStatus == 'rejected') ...[
              const Notice('Your last payment details could not be verified. Please check and send them again.'),
              const SizedBox(height: 10),
            ],
            PaymentAccountDetails(instructions: _instructions, method: order.paymentMethod, onRetry: _loadInstructions),
            const SizedBox(height: 10),
            TextField(
              controller: _reference,
              maxLength: 100,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(labelText: 'Transaction / reference ID', counterText: ''),
            ),
            const SizedBox(height: 10),
            ProofPicker(
              fileName: _proofFile,
              onUploaded: (f) => setState(() {
                _proofFile = f;
                _message = null;
              }),
              onError: (m) => setState(() => _message = m),
            ),
            const SizedBox(height: 10),
            BusyButton(
              busy: _busy,
              onPressed: _reference.text.trim().isEmpty && _proofFile == null
                  ? null
                  : () => _act(
                        '/api/orders/${order.id}/payment',
                        {
                          if (_reference.text.trim().isNotEmpty) 'reference': _reference.text.trim(),
                          'proofFile': ?_proofFile,
                        },
                        done: () {
                          _reference.clear();
                          _proofFile = null;
                        },
                      ),
              label: 'Submit for verification',
            ),
          ],
        ),
      );

  Widget _feedbackForm(Order order) {
    final feedback = order.feedback;
    Widget stars(int value, {ValueChanged<int>? onTap}) => Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            for (var n = 1; n <= 5; n++)
              IconButton(
                tooltip: '$n star${n == 1 ? '' : 's'}',
                visualDensity: onTap == null ? VisualDensity.compact : null,
                onPressed: onTap == null ? null : () => onTap(n),
                icon: Icon(
                  n <= value ? Icons.star_rounded : Icons.star_outline_rounded,
                  size: onTap == null ? 24 : 34,
                  color: n <= value ? const Color(0xFFFBBF24) : const Color(0xFFD4D4D8),
                ),
              ),
          ],
        );

    return Panel(
      title: 'How was your order?',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: feedback != null && !_editFeedback
            ? [
                stars(feedback.rating),
                if ((feedback.comment ?? '').isNotEmpty) Text(feedback.comment!, textAlign: TextAlign.center),
                const SizedBox(height: 6),
                const Text('Thank you for your feedback!', textAlign: TextAlign.center, style: TextStyle(color: Brand.green, fontWeight: FontWeight.w700)),
                TextButton(
                  onPressed: () => setState(() {
                    _stars = feedback.rating;
                    _comment.text = feedback.comment ?? '';
                    _editFeedback = true;
                  }),
                  child: const Text('Change my feedback'),
                ),
              ]
            : [
                stars(_stars, onTap: (n) => setState(() => _stars = n)),
                TextField(
                  controller: _comment,
                  maxLength: 500,
                  minLines: 2,
                  maxLines: 4,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(hintText: 'Tell us more (optional)', counterText: ''),
                ),
                const SizedBox(height: 10),
                BusyButton(
                  busy: _busy,
                  onPressed: () {
                    if (_stars == 0) {
                      setState(() => _message = 'Please tap the stars to rate your order.');
                      return;
                    }
                    _act(
                      '/api/orders/${order.id}/feedback',
                      {'rating': _stars, 'comment': _comment.text.trim().isEmpty ? null : _comment.text.trim()},
                      done: () => _editFeedback = false,
                    );
                  },
                  label: 'Send feedback',
                ),
              ],
      ),
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.order});

  final Order order;

  @override
  Widget build(BuildContext context) {
    final reached = {for (final h in order.history) h.to: h.at};
    return Column(
      children: [
        for (final step in timelineSteps(order.type, order.paymentMethod))
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  reached.containsKey(step) ? Icons.check_circle : Icons.radio_button_unchecked,
                  size: 20,
                  color: reached.containsKey(step)
                      ? Brand.green
                      : (step == order.status ? const Color(0xFFF59E0B) : const Color(0xFFD4D4D8)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(step, style: TextStyle(fontWeight: FontWeight.w700, color: reached.containsKey(step) ? Brand.ink : Brand.muted)),
                      if (reached[step] != null) Text(when(reached[step]), style: const TextStyle(color: Brand.muted, fontSize: 11.5)),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
