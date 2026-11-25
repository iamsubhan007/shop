import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models/settings.dart';
import '../state/auth_state.dart';
import '../state/cart_state.dart';
import '../state/site_state.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../utils/order_status.dart';
import '../widgets/common.dart';
import '../widgets/payment_proof.dart';
import 'location_section.dart';
import 'order_detail_screen.dart';

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final _notes = TextEditingController();
  final _reference = TextEditingController();
  final _coupon = TextEditingController();
  final _scroll = ScrollController();

  Map<String, dynamic>? _instructions;
  String _method = '';
  String? _proofFile;
  bool _uploading = false;

  /// { code, discount } from the server, and the subtotal it was checked against.
  (String, num, num)? _applied;
  String? _couponMessage;
  bool _checkingCoupon = false;

  bool _submitting = false;
  String? _error;
  String? _idempotencyKey;

  @override
  void initState() {
    super.initState();
    _loadInstructions();
    // After the first frame: refreshing notifies listeners, which is not allowed while building.
    final site = context.read<SiteState>();
    WidgetsBinding.instance.addPostFrameCallback((_) => site.refresh());
  }

  @override
  void dispose() {
    _notes.dispose();
    _reference.dispose();
    _coupon.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _loadInstructions() async {
    try {
      final j = await context.read<ApiClient>().get('/api/settings', session: Session.customer, query: {'payment': '1'});
      final p = j['paymentInstructions'];
      if (mounted && p is Map<String, dynamic>) setState(() => _instructions = p);
    } on ApiException {
      // The account details panel offers a retry.
    }
  }

  void _fail(String message) {
    setState(() => _error = message);
    if (_scroll.hasClients) _scroll.animateTo(0, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
  }

  Future<void> _applyCoupon(num subtotal) async {
    FocusScope.of(context).unfocus();
    setState(() {
      _checkingCoupon = true;
      _couponMessage = null;
    });
    try {
      final j = await context.read<ApiClient>().post(
        '/api/coupons/validate',
        session: Session.customer,
        body: {'code': _coupon.text.trim(), 'subtotal': subtotal},
      );
      if (mounted) setState(() => _applied = ('${j['code']}', asNum(j['discount']), subtotal));
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _applied = null;
          _couponMessage = e.message;
        });
      }
    } finally {
      if (mounted) setState(() => _checkingCoupon = false);
    }
  }

  Future<void> _place() async {
    FocusScope.of(context).unfocus();
    final cart = context.read<CartState>();
    final auth = context.read<AuthState>();
    final api = context.read<ApiClient>();
    final user = auth.user;
    if (user == null) return _fail('Please sign in to place your order.');
    if (cart.items.isEmpty) return _fail('Your cart is empty.');
    final delivery = cart.orderType == 'delivery';
    final location = cart.location;
    if (delivery) {
      if (location == null) return _fail('Please set your delivery location on the map.');
      if (!location.eligible) return _fail('Your location is outside our delivery area. Please choose pickup.');
      if (cart.address.trim().length < 5) return _fail('Please enter your full delivery address.');
    }
    if (_method.isEmpty) return _fail('Please choose a payment method.');

    setState(() {
      _submitting = true;
      _error = null;
    });
    // The same key on a retry means a request that did reach the server is not turned into a second order.
    _idempotencyKey ??= uuidV4();
    final prepaid = _method != 'cod';
    final reference = _reference.text.trim();
    final applied = _applied != null && _applied!.$3 == cart.subtotal ? _applied : null;
    try {
      final j = await api.post('/api/checkout', session: Session.customer, body: {
        'orderType': cart.orderType,
        'customerName': user.fullName,
        'customerPhone': user.phone,
        if (delivery) 'deliveryAddress': cart.address.trim(),
        if (delivery) 'deliveryLat': location!.lat,
        if (delivery) 'deliveryLng': location!.lng,
        'paymentMethod': _method,
        if (prepaid && reference.isNotEmpty) 'paymentReference': reference,
        if (prepaid && _proofFile != null) 'paymentProofFile': _proofFile,
        if (_notes.text.trim().isNotEmpty) 'specialInstructions': _notes.text.trim(),
        if (applied != null) 'couponCode': applied.$1,
        'idempotencyKey': _idempotencyKey,
        'items': cart.items.map((i) => i.toOrderLine()).toList(),
      });
      cart.clear();
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute<void>(builder: (_) => OrderDetailScreen(orderId: '${j['orderId']}', justPlaced: true)),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.status == 401) {
        await auth.expired();
        if (mounted) Navigator.pop(context);
        return;
      }
      // A refusal means nothing was created, so a corrected retry is a new order. After a network error or a
      // server crash we cannot know, so the key is kept.
      if (e.status >= 400 && e.status < 500 && e.code != 'ordering_closed') _idempotencyKey = null;
      _fail(e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartState>();
    final user = context.watch<AuthState>().user;
    final settings = context.watch<SiteState>().settings;

    return Scaffold(
      appBar: AppBar(title: const Text('Checkout')),
      body: settings == null || user == null
          ? const Center(child: CircularProgressIndicator())
          : cart.items.isEmpty
              ? const EmptyState(icon: Icons.shopping_bag_outlined, title: 'Your cart is empty')
              : _form(context, cart, user, settings),
    );
  }

  Widget _form(BuildContext context, CartState cart, Customer user, ShopSettings settings) {
    final deliveryOn = settings.deliveryAvailable;
    final pickupOn = settings.pickupEnabled;
    // Keep the chosen order type valid against the shop's settings.
    if (cart.orderType == 'delivery' && !deliveryOn && pickupOn) {
      WidgetsBinding.instance.addPostFrameCallback((_) => cart.setOrderType('pickup'));
    }
    final methods = paymentMethodsFor(cart.orderType).where(settings.methodEnabled).toList();
    if (!methods.contains(_method)) _method = methods.isEmpty ? '' : methods.first;

    final delivery = cart.orderType == 'delivery';
    final fee = settings.estimateDeliveryFee(cart.orderType, cart.subtotal);
    final coupon = _applied != null && _applied!.$3 == cart.subtotal ? _applied : null;
    final couponStale = _applied != null && coupon == null;
    final total = cart.subtotal + fee - (coupon?.$2 ?? 0);

    return Narrow(
      child: SingleChildScrollView(
        controller: _scroll,
        padding: const EdgeInsets.all(16),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (!settings.orderingOpen) ...[
              Notice(settings.orderingNotice.isEmpty ? 'We are not taking orders right now.' : settings.orderingNotice, kind: NoticeKind.warning),
              const SizedBox(height: 12),
            ],
            if (_error != null) ...[Notice(_error!), const SizedBox(height: 12)],
            Panel(
              title: 'How would you like your order?',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SegmentedButton<String>(
                    segments: [
                      ButtonSegment(value: 'delivery', enabled: deliveryOn, label: const Text('Home delivery'), icon: const Icon(Icons.delivery_dining)),
                      ButtonSegment(value: 'pickup', enabled: pickupOn, label: const Text('Pickup'), icon: const Icon(Icons.storefront)),
                    ],
                    selected: {cart.orderType},
                    showSelectedIcon: false,
                    onSelectionChanged: (v) => cart.setOrderType(v.first),
                  ),
                  if (!deliveryOn && settings.deliveryNotice.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Notice(settings.deliveryNotice, kind: NoticeKind.warning),
                  ],
                  if (!delivery) ...[
                    const SizedBox(height: 10),
                    Text('Collect from: ${settings.address}', style: const TextStyle(fontSize: 13)),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton.icon(
                        onPressed: () => openLink(context, directionsLink(settings.lat, settings.lng)),
                        icon: const Icon(Icons.directions, size: 18),
                        label: const Text('Get directions'),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 12),
            if (delivery) ...[LocationSection(settings: settings), const SizedBox(height: 12)],
            Panel(
              title: 'Contact',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('${user.fullName} · ${user.phone}\n${user.email}', style: const TextStyle(color: Brand.muted, fontSize: 13)),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _notes,
                    maxLength: 500,
                    minLines: 2,
                    maxLines: 4,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: const InputDecoration(hintText: 'Special instructions (optional)', counterText: ''),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            _payment(context, settings, methods, total),
            const SizedBox(height: 12),
            Panel(
              title: 'Order summary',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final i in cart.items) AmountRow('${i.quantity} × ${i.title}', rs(i.price * i.quantity), color: Brand.ink),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _coupon,
                          maxLength: 40,
                          textCapitalization: TextCapitalization.characters,
                          onChanged: (_) => setState(() {}),
                          decoration: const InputDecoration(hintText: 'Coupon code', counterText: ''),
                        ),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton(
                        onPressed: _coupon.text.trim().isEmpty || _checkingCoupon ? null : () => _applyCoupon(cart.subtotal),
                        child: const Text('Apply'),
                      ),
                    ],
                  ),
                  if (couponStale || _couponMessage != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(
                        couponStale ? 'Cart changed. Please apply your coupon again.' : _couponMessage!,
                        style: const TextStyle(color: Brand.red, fontSize: 12),
                      ),
                    ),
                  const Divider(height: 20),
                  AmountRow('Subtotal', rs(cart.subtotal)),
                  if (coupon != null) AmountRow('Coupon ${coupon.$1}', '- ${rs(coupon.$2)}', color: Brand.green),
                  AmountRow('Delivery', !delivery ? 'Pickup' : (fee > 0 ? rs(fee) : 'Free')),
                  AmountRow('Total', rs(total), bold: true),
                  const SizedBox(height: 4),
                  const Text('Final prices and availability are confirmed when you place the order.', style: TextStyle(color: Brand.muted, fontSize: 11)),
                  const SizedBox(height: 14),
                  BusyButton(
                    busy: _submitting,
                    onPressed: !settings.orderingOpen || _method.isEmpty || _uploading || cart.hasUnavailable ? null : _place,
                    label: 'Place order · ${rs(total)}',
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _payment(BuildContext context, ShopSettings settings, List<String> methods, num total) {
    const icons = {'bank_transfer': Icons.account_balance, 'jazzcash': Icons.account_balance_wallet_outlined, 'easypaisa': Icons.account_balance_wallet_outlined, 'cod': Icons.payments_outlined};
    final prepaid = _method.isNotEmpty && _method != 'cod';
    return Panel(
      title: 'Payment',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (context.read<CartState>().orderType == 'pickup')
            const Text('Cash on delivery is only available for home delivery.', style: TextStyle(color: Brand.muted, fontSize: 12)),
          if (methods.isEmpty) const Notice('No payment method is available right now. Please contact the shop.'),
          for (final m in methods)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: ListTile(
                selected: _method == m,
                selectedTileColor: Brand.redSoft,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: _method == m ? Brand.red : Brand.line)),
                leading: Icon(icons[m]),
                title: Text(paymentLabel(m), style: const TextStyle(fontWeight: FontWeight.w600)),
                trailing: Icon(_method == m ? Icons.radio_button_checked : Icons.radio_button_off),
                onTap: () => setState(() => _method = m),
              ),
            ),
          if (_method == 'cod')
            const Padding(
              padding: EdgeInsets.only(top: 10),
              child: Text('Pay in cash to the rider when your order arrives.', style: TextStyle(color: Brand.muted, fontSize: 13)),
            ),
          if (prepaid) ...[
            const SizedBox(height: 12),
            PaymentAccountDetails(instructions: _instructions, method: _method, onRetry: _loadInstructions),
            const SizedBox(height: 10),
            Text(
              'Send ${rs(total)}, then enter the transaction ID and/or upload a screenshot. You can also add it after placing the order. We confirm your order once we verify the payment.',
              style: const TextStyle(color: Brand.muted, fontSize: 12.5),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _reference,
              maxLength: 100,
              decoration: const InputDecoration(labelText: 'Transaction / reference ID', counterText: ''),
            ),
            const SizedBox(height: 10),
            ProofPicker(
              fileName: _proofFile,
              onUploaded: (f) => setState(() {
                _proofFile = f;
                _error = null;
              }),
              onError: _fail,
              onBusy: (v) {
                if (mounted) setState(() => _uploading = v);
              },
            ),
          ],
        ],
      ),
    );
  }
}

/// The shop's account number for the chosen method, with tap-to-copy.
class PaymentAccountDetails extends StatelessWidget {
  const PaymentAccountDetails({super.key, required this.instructions, required this.method, required this.onRetry});

  final Map<String, dynamic>? instructions;
  final String method;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final all = instructions;
    if (all == null) {
      return OutlinedButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh, size: 18), label: const Text('Show account details'));
    }
    final account = all[method];
    final note = '${all['instructions'] ?? ''}';
    if (account is! Map<String, dynamic>) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: const Color(0xFFFAFAFA), borderRadius: BorderRadius.circular(12), border: Border.all(color: Brand.line)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final e in account.entries)
            if (e.key != 'enabled' && '${e.value ?? ''}'.isNotEmpty)
              InkWell(
                onTap: () async {
                  await Clipboard.setData(ClipboardData(text: '${e.value}'));
                  if (context.mounted) toast(context, 'Copied');
                },
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 5),
                  child: Row(
                    children: [
                      Text(readable(e.key), style: const TextStyle(color: Brand.muted, fontSize: 12.5)),
                      const SizedBox(width: 12),
                      Expanded(child: Text('${e.value}', textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w700))),
                      const SizedBox(width: 6),
                      const Icon(Icons.copy, size: 15, color: Brand.muted),
                    ],
                  ),
                ),
              ),
          if (note.isNotEmpty) ...[const Divider(height: 16), Text(note, style: const TextStyle(color: Brand.muted, fontSize: 12))],
        ],
      ),
    );
  }
}
