import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../models/menu.dart';
import '../state/cart_state.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../widgets/common.dart';
import '../widgets/net_image.dart';

Future<void> showProductSheet(BuildContext context, Product product) => _sheet(context, _ProductSheet(product: product));

Future<void> showDealSheet(BuildContext context, Deal deal) => _sheet(context, _DealSheet(deal: deal));

Future<void> _sheet(BuildContext context, Widget child) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      clipBehavior: Clip.antiAlias,
      backgroundColor: Colors.white,
      constraints: const BoxConstraints(maxWidth: 560),
      builder: (context) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: child,
      ),
    );

class _ProductSheet extends StatefulWidget {
  const _ProductSheet({required this.product});

  final Product product;

  @override
  State<_ProductSheet> createState() => _ProductSheetState();
}

class _ProductSheetState extends State<_ProductSheet> {
  final _notes = TextEditingController();
  int _quantity = 1;
  int _page = 0;

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.product;
    final images = p.gallery;
    final favorite = context.select<CartState, bool>((c) => c.isFavorite(p.id));
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Flexible(
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  height: 240,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      images.isEmpty
                          ? const NetImage(null)
                          : PageView(
                              onPageChanged: (i) => setState(() => _page = i),
                              children: [for (final img in images) NetImage(img, width: 768)],
                            ),
                      Positioned(
                        top: 8,
                        left: 8,
                        child: IconButton.filled(
                          tooltip: 'Close',
                          style: IconButton.styleFrom(backgroundColor: Colors.black54),
                          onPressed: () => Navigator.pop(context),
                          icon: const Icon(Icons.close, color: Colors.white),
                        ),
                      ),
                      Positioned(
                        top: 8,
                        right: 8,
                        child: IconButton.filled(
                          tooltip: favorite ? 'Remove from favorites' : 'Add to favorites',
                          style: IconButton.styleFrom(backgroundColor: Colors.white),
                          onPressed: () => context.read<CartState>().toggleFavorite(p.id),
                          icon: Icon(favorite ? Icons.favorite : Icons.favorite_border, color: favorite ? Brand.red : Brand.muted),
                        ),
                      ),
                      if (images.length > 1)
                        Positioned(
                          bottom: 8,
                          left: 0,
                          right: 0,
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              for (var i = 0; i < images.length; i++)
                                Container(
                                  width: 7,
                                  height: 7,
                                  margin: const EdgeInsets.symmetric(horizontal: 3),
                                  decoration: BoxDecoration(shape: BoxShape.circle, color: i == _page ? Colors.white : Colors.white54),
                                ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(p.name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Text(rs(p.price), style: const TextStyle(color: Brand.red, fontWeight: FontWeight.w900, fontSize: 16)),
                          if (p.compareAtPrice != null && p.compareAtPrice! > p.price) ...[
                            const SizedBox(width: 8),
                            Text(rs(p.compareAtPrice), style: const TextStyle(color: Brand.muted, decoration: TextDecoration.lineThrough)),
                          ],
                          const Spacer(),
                          if (p.categoryName.isNotEmpty) Text(p.categoryName, style: const TextStyle(color: Brand.muted, fontSize: 12)),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Text(
                        p.description.isEmpty ? 'Freshly prepared and baked in our traditional tandoor upon order.' : p.description,
                        style: const TextStyle(color: Brand.muted, height: 1.4),
                      ),
                      if (!p.available) ...[const SizedBox(height: 12), const Notice('Currently sold out.')],
                      const SizedBox(height: 16),
                      TextField(
                        controller: _notes,
                        maxLength: 200,
                        decoration: const InputDecoration(
                          labelText: 'Special instructions (optional)',
                          hintText: 'e.g. extra crispy, less butter',
                          counterText: '',
                        ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          const Expanded(child: Text('Quantity', style: TextStyle(fontWeight: FontWeight.w700))),
                          QuantityStepper(value: _quantity, onChanged: (q) => setState(() => _quantity = q)),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        _AddBar(
          total: p.price * _quantity,
          label: p.available ? 'Add to Cart' : 'Sold Out',
          onAdd: p.available
              ? () {
                  context.read<CartState>().addProduct(p, quantity: _quantity, notes: _notes.text);
                  toast(context, '${p.name} added to cart');
                  Navigator.pop(context);
                }
              : null,
        ),
      ],
    );
  }
}

class _DealSheet extends StatefulWidget {
  const _DealSheet({required this.deal});

  final Deal deal;

  @override
  State<_DealSheet> createState() => _DealSheetState();
}

class _DealSheetState extends State<_DealSheet> {
  int _quantity = 1;

  @override
  Widget build(BuildContext context) {
    final d = widget.deal;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Flexible(
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  height: 220,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      NetImage(d.imageUrl, width: 768),
                      Positioned(
                        top: 8,
                        left: 8,
                        child: IconButton.filled(
                          tooltip: 'Close',
                          style: IconButton.styleFrom(backgroundColor: Colors.black54),
                          onPressed: () => Navigator.pop(context),
                          icon: const Icon(Icons.close, color: Colors.white),
                        ),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(d.title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Text(rs(d.price), style: const TextStyle(color: Brand.red, fontWeight: FontWeight.w900, fontSize: 16)),
                          if (d.originalPrice != null && d.originalPrice! > d.price) ...[
                            const SizedBox(width: 8),
                            Text(rs(d.originalPrice), style: const TextStyle(color: Brand.muted, decoration: TextDecoration.lineThrough)),
                          ],
                        ],
                      ),
                      if (d.description.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text(d.description, style: const TextStyle(color: Brand.muted, height: 1.4)),
                      ],
                      const SizedBox(height: 12),
                      for (final item in d.items)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 3),
                          child: Row(
                            children: [
                              const Icon(Icons.check, size: 16, color: Brand.green),
                              const SizedBox(width: 8),
                              Expanded(child: Text(item)),
                            ],
                          ),
                        ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          const Expanded(child: Text('Quantity', style: TextStyle(fontWeight: FontWeight.w700))),
                          QuantityStepper(value: _quantity, onChanged: (q) => setState(() => _quantity = q)),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        _AddBar(
          total: d.price * _quantity,
          label: 'Add Deal to Cart',
          onAdd: () {
            context.read<CartState>().addDeal(d, quantity: _quantity);
            toast(context, '${d.title} added to cart');
            Navigator.pop(context);
          },
        ),
      ],
    );
  }
}

class _AddBar extends StatelessWidget {
  const _AddBar({required this.total, required this.label, required this.onAdd});

  final num total;
  final String label;
  final VoidCallback? onAdd;

  @override
  Widget build(BuildContext context) => Container(
        decoration: const BoxDecoration(color: Color(0xFFFAFAFA), border: Border(top: BorderSide(color: Brand.line))),
        padding: const EdgeInsets.all(14),
        child: SafeArea(
          top: false,
          child: Row(
            children: [
              Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Total', style: TextStyle(color: Brand.muted, fontSize: 11)),
                  Text(rs(total), style: const TextStyle(color: Brand.red, fontWeight: FontWeight.w900, fontSize: 17)),
                ],
              ),
              const SizedBox(width: 18),
              Expanded(
                child: FilledButton.icon(
                  onPressed: onAdd,
                  icon: const Icon(Icons.shopping_cart_outlined, size: 18),
                  label: Text(label),
                ),
              ),
            ],
          ),
        ),
      );
}
