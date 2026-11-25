import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models/menu.dart' show maps;
import '../models/order.dart';
import '../state/auth_state.dart';
import '../state/cart_state.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../utils/order_status.dart';
import '../widgets/common.dart';
import 'order_detail_screen.dart';
import 'sign_in_screen.dart';

/// The signed-in customer's past and current orders, with reorder.
class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key, required this.visible, required this.onBrowse, required this.onOpenCart});

  final bool visible;
  final VoidCallback onBrowse;
  final VoidCallback onOpenCart;

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  List<Order>? _orders;
  String? _error;
  String? _loadedFor;
  String? _reordering;

  @override
  void didUpdateWidget(OrdersScreen old) {
    super.didUpdateWidget(old);
    if (widget.visible && !old.visible) _load();
  }

  Future<void> _load() async {
    final auth = context.read<AuthState>();
    final user = auth.user;
    if (user == null) return;
    _loadedFor = user.id;
    try {
      final j = await context.read<ApiClient>().get('/api/orders/mine', session: Session.customer);
      if (mounted) {
        setState(() {
          _orders = maps(j['orders']).map(Order.new).toList();
          _error = null;
        });
      }
    } on ApiException catch (e) {
      if (e.status == 401) {
        await auth.expired();
      } else if (mounted) {
        setState(() => _error = e.message);
      }
    }
  }

  Future<void> _open(Order order) async {
    await Navigator.push<void>(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: order.id)));
    await _load();
  }

  Future<void> _reorder(Order order) async {
    setState(() => _reordering = order.id);
    List<ReorderItem>? items;
    try {
      final j = await context.read<ApiClient>().post('/api/orders/${order.id}/reorder', session: Session.customer);
      items = maps(j['items']).map(ReorderItem.fromJson).toList();
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message);
    }
    if (!mounted) return;
    setState(() => _reordering = null);
    if (items == null) return;

    final available = items.where((i) => i.available).toList();
    final go = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Reorder ${order.number}'),
        content: SizedBox(
          width: 420,
          child: ListView(
            shrinkWrap: true,
            children: [
              const Text("Prices below are today's prices. Nothing is ordered until you check out.", style: TextStyle(color: Brand.muted, fontSize: 12)),
              const SizedBox(height: 10),
              for (final i in items!)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          '${i.quantity}× ${i.title}'
                          '${i.available ? (i.priceChanged ? '\nwas ${rs(i.oldPrice)} each' : '') : '\nNo longer available, will be skipped'}',
                          style: TextStyle(color: i.available ? Brand.ink : Brand.muted),
                        ),
                      ),
                      if (i.available) Text(rs(i.price * i.quantity)),
                    ],
                  ),
                ),
              if (available.isEmpty) const Notice('None of these items are available right now.'),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Close')),
          if (available.isNotEmpty) FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Add to cart')),
        ],
      ),
    );
    if (go != true || !mounted) return;
    final cart = context.read<CartState>()..clear();
    for (final i in available) {
      cart.add(CartItem(id: i.id!, isDeal: i.type == 'deal', title: i.title, price: i.price, imageUrl: i.imageUrl, quantity: i.quantity));
    }
    widget.onOpenCart();
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthState>().user;
    if (user?.id != _loadedFor) {
      // Signed in, out, or as someone else since the list was loaded.
      _orders = null;
      _error = null;
      _loadedFor = null;
      if (user != null && widget.visible) WidgetsBinding.instance.addPostFrameCallback((_) => _load());
    }

    return Scaffold(
      appBar: AppBar(title: const Text('My orders')),
      // Nothing is drawn while the tab is hidden: a loading spinner there would keep animating (and using battery).
      body: !widget.visible ? const SizedBox.shrink() : (user == null ? _signedOut() : _list()),
    );
  }

  Widget _signedOut() => EmptyState(
        icon: Icons.receipt_long_outlined,
        title: 'Sign in to see your orders',
        message: 'Use the same email you ordered with, on the app or the website.',
        action: FilledButton(
          onPressed: () async {
            await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => const SignInScreen()));
            if (mounted) await _load();
          },
          child: const Text('Sign in'),
        ),
      );

  Widget _list() {
    final orders = _orders;
    if (orders == null) {
      return _error == null
          ? const Center(child: CircularProgressIndicator())
          : EmptyState(icon: Icons.wifi_off, title: 'Could not load orders', message: _error, action: FilledButton(onPressed: _load, child: const Text('Try again')));
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: orders.isEmpty
          ? ListView(
              children: [
                Padding(
                  padding: const EdgeInsets.only(top: 80),
                  child: EmptyState(
                    icon: Icons.receipt_long_outlined,
                    title: "You haven't placed any orders yet",
                    action: FilledButton(onPressed: widget.onBrowse, child: const Text('Start ordering')),
                  ),
                ),
              ],
            )
          : Narrow(
              child: ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: orders.length,
                separatorBuilder: (_, _) => const SizedBox(height: 10),
                itemBuilder: (context, index) {
                  final o = orders[index];
                  return Panel(
                    padding: EdgeInsets.zero,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(16),
                      onTap: () => _open(o),
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
                              '${when(o.createdAt)} · ${o.isDelivery ? 'Delivery' : 'Pickup'} · ${paymentLabel(o.paymentMethod)}',
                              style: const TextStyle(color: Brand.muted, fontSize: 12),
                            ),
                            const SizedBox(height: 6),
                            Text(o.itemsText, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13)),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                Expanded(child: Text(rs(o.total), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16))),
                                OutlinedButton(onPressed: () => _open(o), child: const Text('Track')),
                                if (o.status == 'Completed') ...[
                                  const SizedBox(width: 8),
                                  FilledButton.icon(
                                    onPressed: _reordering == o.id ? null : () => _reorder(o),
                                    icon: const Icon(Icons.replay, size: 17),
                                    label: const Text('Reorder'),
                                  ),
                                ],
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
    );
  }
}
