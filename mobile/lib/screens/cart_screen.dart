import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../state/auth_state.dart';
import '../state/cart_state.dart';
import '../state/site_state.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../widgets/common.dart';
import '../widgets/net_image.dart';
import 'checkout_screen.dart';
import 'sign_in_screen.dart';

class CartScreen extends StatelessWidget {
  const CartScreen({super.key, required this.onBrowse});

  final VoidCallback onBrowse;

  Future<void> _checkout(BuildContext context) async {
    final auth = context.read<AuthState>();
    if (auth.user == null || !auth.user!.complete) {
      final ok = await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => const SignInScreen()));
      if (ok != true || !context.mounted) return;
    }
    await Navigator.push<void>(context, MaterialPageRoute(builder: (_) => const CheckoutScreen()));
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartState>();
    final settings = context.watch<SiteState>().settings;
    final fee = settings?.estimateDeliveryFee(cart.orderType, cart.subtotal) ?? 0;

    return Scaffold(
      appBar: AppBar(title: Text(cart.count > 0 ? 'Your cart (${cart.count})' : 'Your cart')),
      body: cart.items.isEmpty
          ? EmptyState(
              icon: Icons.shopping_bag_outlined,
              title: 'Your cart is empty',
              action: FilledButton(onPressed: onBrowse, child: const Text('Browse the menu')),
            )
          : Narrow(
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  for (final item in cart.items)
                    Padding(
                      key: ValueKey(item.key),
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _Line(item: item),
                    ),
                  if (cart.hasUnavailable) ...[
                    const Notice('Remove the items that are no longer available before checking out.'),
                    const SizedBox(height: 10),
                  ],
                  Panel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        SegmentedButton<String>(
                          segments: const [
                            ButtonSegment(value: 'delivery', label: Text('Delivery'), icon: Icon(Icons.delivery_dining)),
                            ButtonSegment(value: 'pickup', label: Text('Pickup'), icon: Icon(Icons.storefront)),
                          ],
                          selected: {cart.orderType},
                          showSelectedIcon: false,
                          onSelectionChanged: (v) => cart.setOrderType(v.first),
                        ),
                        const SizedBox(height: 12),
                        AmountRow('Subtotal', rs(cart.subtotal)),
                        AmountRow('Delivery', cart.orderType == 'pickup' ? 'Pickup' : (fee > 0 ? rs(fee) : 'Free')),
                        AmountRow('Total', rs(cart.subtotal + fee), bold: true),
                        const SizedBox(height: 12),
                        FilledButton(
                          onPressed: cart.hasUnavailable ? null : () => _checkout(context),
                          child: const Text('Proceed to checkout'),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.item});

  final CartItem item;

  @override
  Widget build(BuildContext context) {
    final cart = context.read<CartState>();
    return Panel(
      padding: const EdgeInsets.all(10),
      borderColor: item.available ? null : Brand.red,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: SizedBox(width: 68, height: 68, child: NetImage(item.imageUrl, width: 256)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: Text(item.title, style: const TextStyle(fontWeight: FontWeight.w800))),
                    InkWell(
                      onTap: () => cart.setQuantity(item.key, 0),
                      child: const Padding(
                        padding: EdgeInsets.all(4),
                        child: Icon(Icons.delete_outline, size: 19, color: Brand.muted, semanticLabel: 'Remove'),
                      ),
                    ),
                  ],
                ),
                if (item.notes.isNotEmpty) Text(item.notes, style: const TextStyle(color: Brand.muted, fontSize: 12)),
                if (!item.available) const Text('No longer available', style: TextStyle(color: Brand.red, fontSize: 12)),
                Row(
                  children: [
                    Expanded(child: Text(rs(item.price * item.quantity), style: const TextStyle(color: Brand.red, fontWeight: FontWeight.w900))),
                    QuantityStepper(value: item.quantity, min: 0, onChanged: (q) => cart.setQuantity(item.key, q)),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
