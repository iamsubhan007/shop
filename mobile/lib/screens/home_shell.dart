import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../state/cart_state.dart';
import '../state/site_state.dart';
import '../widgets/poller.dart';
import 'account_screen.dart';
import 'cart_screen.dart';
import 'menu_screen.dart';
import 'orders_screen.dart';

/// The customer app: Home, Menu, Cart, My Orders and More.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => HomeShellState();
}

class HomeShellState extends State<HomeShell> {
  static const _menuTab = 1;
  static const _cartTab = 2;
  static const _ordersTab = 3;

  int _tab = 0;
  late final Poller _refresh;

  void show(int tab) => setState(() => _tab = tab);

  @override
  void initState() {
    super.initState();
    // Keeps prices, sold-out items and opening state current while the app is open.
    _refresh = Poller(const Duration(minutes: 2), () async {
      await Future<void>.delayed(Duration.zero);
      if (!mounted) return;
      final site = context.read<SiteState>();
      final cart = context.read<CartState>();
      await site.refresh();
      final menu = site.menu;
      if (menu != null && site.error == null) cart.syncWithMenu(menu);
    });
  }

  @override
  void dispose() {
    _refresh.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final count = context.select<CartState, int>((c) => c.count);
    return Scaffold(
      body: IndexedStack(
        index: _tab,
        children: [
          const MenuScreen(home: true),
          const MenuScreen(),
          CartScreen(onBrowse: () => show(_menuTab)),
          OrdersScreen(visible: _tab == _ordersTab, onBrowse: () => show(_menuTab), onOpenCart: () => show(_cartTab)),
          const AccountScreen(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: show,
        destinations: [
          const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          const NavigationDestination(
            icon: Icon(Icons.restaurant_menu_outlined),
            selectedIcon: Icon(Icons.restaurant_menu),
            label: 'Menu',
          ),
          NavigationDestination(
            icon: Badge(isLabelVisible: count > 0, label: Text('$count'), child: const Icon(Icons.shopping_bag_outlined)),
            selectedIcon: Badge(isLabelVisible: count > 0, label: Text('$count'), child: const Icon(Icons.shopping_bag)),
            label: 'Cart',
          ),
          const NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long),
            label: 'My Orders',
          ),
          const NavigationDestination(icon: Icon(Icons.more_horiz), label: 'More'),
        ],
      ),
    );
  }
}
