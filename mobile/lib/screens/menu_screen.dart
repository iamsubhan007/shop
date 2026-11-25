import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../config.dart';
import '../models/menu.dart';
import '../models/settings.dart';
import '../state/cart_state.dart';
import '../state/site_state.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../widgets/common.dart';
import '../widgets/menu_pdf_button.dart';
import '../widgets/net_image.dart';
import 'product_sheet.dart';

/// The website's two shop pages. Home has the banner, the deals and every item in one grid; Menu is the full menu
/// grouped by category. Both have a Deals category in the bar at the top.
class MenuScreen extends StatefulWidget {
  const MenuScreen({super.key, this.home = false});

  final bool home;

  @override
  State<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends State<MenuScreen> {
  static const _all = 'all';
  static const _deals = 'deals';
  static const _favorites = 'favorites';

  final _search = TextEditingController();
  final _scroll = ScrollController();
  String _filter = _all; // a category id, or one of the three above

  /// Shows a category from its beginning, however far down the page had been scrolled.
  void _show(String filter) {
    setState(() => _filter = filter);
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  @override
  void dispose() {
    _search.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final site = context.watch<SiteState>();
    final cart = context.watch<CartState>();
    final menu = site.menu;
    final settings = site.settings;

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(color: Brand.red, borderRadius: BorderRadius.circular(9)),
              child: Icon(widget.home ? Icons.local_fire_department : Icons.restaurant_menu, size: 19, color: Colors.white),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(widget.home ? AppConfig.appName : 'Full Tandoor Menu', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
                  Text(
                    widget.home ? 'Fresh from the tandoor' : 'Naans, parathas, deals and sides',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11, color: Color(0xFFF87171)),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      body: menu == null ? _loadingOrError(site) : _content(context, menu, settings, cart, site),
    );
  }

  Widget _loadingOrError(SiteState site) {
    if (site.error != null && !site.loading) {
      return EmptyState(
        icon: Icons.wifi_off,
        title: 'Could not load the menu',
        message: site.error,
        action: FilledButton(onPressed: site.refresh, child: const Text('Try again')),
      );
    }
    return const Center(child: CircularProgressIndicator());
  }

  Widget _content(BuildContext context, MenuData menu, ShopSettings? settings, CartState cart, SiteState site) {
    final term = _search.text.trim().toLowerCase();
    final dealsOnly = _filter == _deals;
    final deals = menu.deals
        .where((d) =>
            term.isEmpty ||
            d.title.toLowerCase().contains(term) ||
            d.description.toLowerCase().contains(term) ||
            d.items.any((i) => i.toLowerCase().contains(term)))
        .toList();
    final matches = dealsOnly
        ? <Product>[]
        : menu.products.where((p) {
            if (_filter == _favorites && !cart.isFavorite(p.id)) return false;
            if (_filter != _all && _filter != _favorites && p.categoryId != _filter) return false;
            if (term.isEmpty) return true;
            return p.name.toLowerCase().contains(term) ||
                p.description.toLowerCase().contains(term) ||
                p.categoryName.toLowerCase().contains(term);
          }).toList();
    // Home lists everything together; Menu (and any chosen category) is grouped under category names.
    final sections = widget.home && _filter == _all
        ? [if (matches.isNotEmpty) ('All Fresh Naans', matches)]
        : menu.sections(matches);
    final dealsRow = _filter == _all && deals.isNotEmpty;
    final nothing = dealsOnly ? deals.isEmpty : sections.isEmpty && !dealsRow;

    final width = MediaQuery.sizeOf(context).width;
    final columns = (width / 200).floor().clamp(2, 5);
    // Card height = picture (4:3) + text block, so every card lines up whatever its text.
    final cardWidth = (width - 32 - (columns - 1) * 12) / columns;
    final textScale = MediaQuery.textScalerOf(context).scale(1).clamp(0.85, 1.6);
    final cardHeight = cardWidth * 0.75 + 52 + 74 * textScale;
    final dealColumns = (width / 360).floor().clamp(1, 3);
    final dealWidth = (width - 32 - (dealColumns - 1) * 12) / dealColumns;

    return RefreshIndicator(
      onRefresh: site.refresh,
      child: CustomScrollView(
        controller: _scroll,
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        slivers: [
          if (settings != null && !settings.orderingOpen)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: Notice(
                  settings.orderingNotice.isEmpty ? 'We are not taking orders right now.' : settings.orderingNotice,
                  kind: NoticeKind.warning,
                ),
              ),
            ),
          if (widget.home && _filter == _all && term.isEmpty) SliverToBoxAdapter(child: _Hero(settings: settings)),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: TextField(
                controller: _search,
                onChanged: (_) => setState(() {}),
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  hintText: 'Search naans, pizza naan, qeema...',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: term.isEmpty
                      ? null
                      : IconButton(
                          tooltip: 'Clear search',
                          icon: const Icon(Icons.close),
                          onPressed: () => setState(_search.clear),
                        ),
                ),
              ),
            ),
          ),
          PinnedHeaderSliver(child: _categoryBar(menu, cart)),
          if (!widget.home && _filter == _all && term.isEmpty)
            const SliverToBoxAdapter(child: Padding(padding: EdgeInsets.fromLTRB(16, 12, 16, 0), child: MenuPdfButton())),
          if (dealsRow) ...[
            SliverToBoxAdapter(
              child: _Heading('Crazy Deals & Combos', kicker: 'VALUE PACKS', onSeeAll: () => _show(_deals)),
            ),
            SliverToBoxAdapter(child: _DealsRow(deals: deals)),
          ],
          if (dealsOnly && deals.isNotEmpty) ...[
            SliverToBoxAdapter(child: _Heading('Crazy Deals & Combos (${deals.length})', kicker: 'VALUE PACKS')),
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              sliver: SliverGrid.builder(
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: dealColumns,
                  mainAxisExtent: dealWidth * 9 / 16 + 112 * textScale.clamp(1.0, 1.6),
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                ),
                itemCount: deals.length,
                itemBuilder: (_, i) => DealCard(deal: deals[i]),
              ),
            ),
          ],
          if (nothing)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.only(top: 40),
                child: EmptyState(
                  icon: _filter == _favorites ? Icons.favorite_border : (dealsOnly ? Icons.local_offer_outlined : Icons.search_off),
                  title: dealsOnly && term.isEmpty ? 'No deals right now' : 'No items found',
                  message: _filter == _favorites
                      ? 'Tap the heart on any item to keep it here.'
                      : (dealsOnly && term.isEmpty ? 'Please check back soon.' : 'Try something else, like "pizza" or "cheese".'),
                  action: OutlinedButton(
                    onPressed: () => setState(() {
                      _filter = _all;
                      _search.clear();
                    }),
                    child: const Text('Clear filters'),
                  ),
                ),
              ),
            ),
          for (final (title, items) in sections) ...[
            SliverToBoxAdapter(child: _Heading('$title (${items.length})')),
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              sliver: SliverGrid.builder(
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: columns,
                  mainAxisExtent: cardHeight,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                ),
                itemCount: items.length,
                itemBuilder: (_, i) => FoodCard(product: items[i]),
              ),
            ),
          ],
          const SliverToBoxAdapter(child: SizedBox(height: 24)),
        ],
      ),
    );
  }

  Widget _categoryBar(MenuData menu, CartState cart) {
    Widget chip(String value, String label, {IconData? icon}) {
      final selected = _filter == value;
      return Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ChoiceChip(
          avatar: icon == null ? null : Icon(icon, size: 15, color: selected ? Colors.white : const Color(0xFFF87171)),
          label: Text(label),
          selected: selected,
          showCheckmark: false,
          onSelected: (_) => _show(value),
          selectedColor: Brand.red,
          backgroundColor: Brand.inkSoft,
          side: BorderSide.none,
          shape: const StadiumBorder(),
          visualDensity: VisualDensity.compact,
          labelStyle: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 12.5),
        ),
      );
    }

    final favorites = cart.favorites.length;
    return ColoredBox(
      color: Brand.ink,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 4, 8, 4),
        child: Row(
          children: [
            chip(_all, 'All'),
            chip(_deals, 'Deals', icon: Icons.local_offer),
            chip(_favorites, favorites > 0 ? 'Favorites ($favorites)' : 'Favorites', icon: Icons.favorite),
            for (final c in menu.categories)
              if (menu.products.any((p) => p.categoryId == c.id)) chip(c.id, c.name),
          ],
        ),
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.settings});

  final ShopSettings? settings;

  @override
  Widget build(BuildContext context) {
    final s = settings;
    return Column(
      children: [
        const AspectRatio(aspectRatio: 1910 / 569, child: NetImage(AppConfig.bannerPath, width: 1024)),
        if (s != null)
          Container(
            width: double.infinity,
            color: const Color(0xFF18181B),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Wrap(
              spacing: 16,
              runSpacing: 6,
              children: [
                if (s.deliveryEnabled) _fact(Icons.delivery_dining, '${s.radiusM} m delivery zone'),
                if (s.hours.isNotEmpty) _fact(Icons.schedule, s.hours),
                if (s.deliveryEnabled && s.freeOver > 0) _fact(Icons.local_offer_outlined, 'Free delivery over ${rs(s.freeOver)}'),
              ],
            ),
          ),
      ],
    );
  }

  Widget _fact(IconData icon, String text) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: const Color(0xFFF87171)),
          const SizedBox(width: 5),
          Text(text, style: const TextStyle(color: Color(0xFFD4D4D8), fontSize: 12)),
        ],
      );
}

class _Heading extends StatelessWidget {
  const _Heading(this.title, {this.kicker, this.onSeeAll});

  final String title;
  final String? kicker;
  final VoidCallback? onSeeAll;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (kicker != null)
                    Text(kicker!, style: const TextStyle(color: Brand.red, fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 1.4)),
                  Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                ],
              ),
            ),
            if (onSeeAll != null)
              TextButton(
                style: TextButton.styleFrom(visualDensity: VisualDensity.compact, padding: const EdgeInsets.symmetric(horizontal: 8)),
                onPressed: onSeeAll,
                child: const Text('See all'),
              ),
          ],
        ),
      );
}

class _DealsRow extends StatelessWidget {
  const _DealsRow({required this.deals});

  final List<Deal> deals;

  @override
  Widget build(BuildContext context) {
    final width = (MediaQuery.sizeOf(context).width * 0.78).clamp(240.0, 340.0);
    final textScale = MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 1.6);
    return SizedBox(
      height: width * 9 / 16 + 112 * textScale,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: deals.length,
        separatorBuilder: (_, _) => const SizedBox(width: 12),
        itemBuilder: (context, i) => SizedBox(width: width, child: DealCard(deal: deals[i])),
      ),
    );
  }
}

class DealCard extends StatelessWidget {
  const DealCard({super.key, required this.deal});

  final Deal deal;

  @override
  Widget build(BuildContext context) => Panel(
        padding: EdgeInsets.zero,
        child: InkWell(
          onTap: () => showDealSheet(context, deal),
          borderRadius: BorderRadius.circular(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AspectRatio(
                aspectRatio: 16 / 9,
                child: ClipRRect(
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      NetImage(deal.imageUrl, width: 640),
                      const DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.center,
                            end: Alignment.bottomCenter,
                            colors: [Colors.transparent, Colors.black87],
                          ),
                        ),
                      ),
                      if (deal.badge != null) Positioned(top: 10, left: 10, child: _tag(deal.badge!, Brand.red)),
                      Positioned(
                        left: 12,
                        bottom: 8,
                        child: Text(rs(deal.price), style: const TextStyle(color: Brand.amber, fontWeight: FontWeight.w900, fontSize: 19)),
                      ),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(deal.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                      const SizedBox(height: 2),
                      Text(
                        deal.items.isNotEmpty ? deal.items.join(' • ') : deal.description,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Brand.muted, fontSize: 12),
                      ),
                      const Spacer(),
                      FilledButton.icon(
                        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(40)),
                        onPressed: () {
                          context.read<CartState>().addDeal(deal);
                          toast(context, '${deal.title} added to cart');
                        },
                        icon: const Icon(Icons.add_shopping_cart, size: 17),
                        label: const Text('Add Deal to Cart'),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      );
}

Widget _tag(String text, Color color) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(99)),
      child: Text(text, style: const TextStyle(color: Colors.white, fontSize: 10.5, fontWeight: FontWeight.w800)),
    );

class FoodCard extends StatelessWidget {
  const FoodCard({super.key, required this.product});

  final Product product;

  @override
  Widget build(BuildContext context) {
    final favorite = context.select<CartState, bool>((c) => c.isFavorite(product.id));
    return Panel(
      padding: EdgeInsets.zero,
      child: InkWell(
        onTap: () => showProductSheet(context, product),
        borderRadius: BorderRadius.circular(16),
        child: Opacity(
          opacity: product.available ? 1 : 0.7,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AspectRatio(
                aspectRatio: 4 / 3,
                child: ClipRRect(
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      NetImage(product.imageUrl, width: 384),
                      if (!product.available)
                        ColoredBox(color: Colors.black54, child: Center(child: _tag('Sold Out', Brand.red))),
                      Positioned(left: 8, bottom: 8, child: _tag(rs(product.price), Brand.red)),
                      Positioned(
                        top: 4,
                        right: 4,
                        child: IconButton.filled(
                          tooltip: favorite ? 'Remove from favorites' : 'Add to favorites',
                          visualDensity: VisualDensity.compact,
                          style: IconButton.styleFrom(backgroundColor: Colors.white.withValues(alpha: 0.92)),
                          onPressed: () => context.read<CartState>().toggleFavorite(product.id),
                          icon: Icon(favorite ? Icons.favorite : Icons.favorite_border, size: 18, color: favorite ? Brand.red : Brand.muted),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(product.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, height: 1.2)),
                      const SizedBox(height: 3),
                      Expanded(
                        child: Text(product.description, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Brand.muted, fontSize: 11, height: 1.25)),
                      ),
                      SizedBox(
                        height: 34,
                        child: OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(
                            foregroundColor: Brand.red,
                            backgroundColor: Brand.redSoft,
                            side: BorderSide.none,
                            padding: EdgeInsets.zero,
                            minimumSize: const Size(0, 34),
                          ),
                          onPressed: product.available
                              ? () {
                                  context.read<CartState>().addProduct(product);
                                  toast(context, '${product.name} added to cart');
                                }
                              : null,
                          icon: const Icon(Icons.add, size: 16),
                          label: const Text('Add'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
