import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../state/auth_state.dart';
import '../theme.dart';
import 'admin/dashboard_screen.dart';
import 'admin/menu_admin_screen.dart';
import 'admin/more_screen.dart';
import 'admin_order_screen.dart';
import 'admin_orders_screen.dart';
import 'kitchen_screen.dart';
import 'new_order_alert.dart';
import 'rider_screen.dart';

/// The staff side of the app. What shows depends on the role: owner/admin get Orders, Kitchen, Menu, Dashboard and
/// the rest of the admin portal under More; kitchen staff get the Kitchen board; riders get their Deliveries. The
/// server enforces the same rules.
class StaffShell extends StatefulWidget {
  const StaffShell({super.key});

  @override
  State<StaffShell> createState() => _StaffShellState();
}

class _StaffShellState extends State<StaffShell> {
  static const _titles = ['Orders', 'Kitchen', 'Menu & Stock', 'Dashboard', 'More'];

  int _tab = 0;

  Future<void> _openOrder(String id) =>
      Navigator.push<void>(context, MaterialPageRoute(builder: (_) => AdminOrderScreen(orderId: id)));

  @override
  Widget build(BuildContext context) {
    final staff = context.watch<StaffState>();
    final user = staff.user;
    if (user == null) return const SizedBox.shrink();

    final title = user.isRider ? 'Deliveries' : (user.isAdmin ? _titles[_tab] : 'Kitchen');
    final Widget screen = user.isRider
        ? const RiderScreen()
        : !user.isAdmin
            ? const KitchenScreen()
            : switch (_tab) {
                0 => AdminOrdersScreen(onOpen: _openOrder),
                1 => const KitchenScreen(),
                2 => const MenuAdminScreen(),
                3 => const DashboardScreen(),
                _ => const AdminMoreScreen(),
              };

    return Scaffold(
      appBar: AppBar(
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
        actions: [
          PopupMenuButton<String>(
            tooltip: 'Account',
            icon: const Icon(Icons.account_circle_outlined),
            onSelected: (value) async {
              if (value == 'customer') staff.setStaffMode(false);
              if (value == 'signout') await staff.signOut();
            },
            itemBuilder: (_) => [
              PopupMenuItem<String>(
                enabled: false,
                child: Text('${user.name}\n${user.role}', style: const TextStyle(color: Brand.ink, fontWeight: FontWeight.w700)),
              ),
              const PopupMenuDivider(),
              const PopupMenuItem(value: 'customer', child: Text('Switch to customer app')),
              const PopupMenuItem(value: 'signout', child: Text('Sign out')),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(child: screen),
          if (!user.isRider)
            NewOrderAlert(
              onOpen: (id) => user.isAdmin ? _openOrder(id) : setState(() => _tab = 1),
            ),
        ],
      ),
      bottomNavigationBar: user.isAdmin
          ? NavigationBar(
              selectedIndex: _tab,
              onDestinationSelected: (i) => setState(() => _tab = i),
              destinations: const [
                NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long), label: 'Orders'),
                NavigationDestination(icon: Icon(Icons.soup_kitchen_outlined), selectedIcon: Icon(Icons.soup_kitchen), label: 'Kitchen'),
                NavigationDestination(icon: Icon(Icons.restaurant_menu_outlined), selectedIcon: Icon(Icons.restaurant_menu), label: 'Menu'),
                NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard), label: 'Dashboard'),
                NavigationDestination(icon: Icon(Icons.menu), label: 'More'),
              ],
            )
          : null,
    );
  }
}
