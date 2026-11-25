import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../state/auth_state.dart';
import '../../theme.dart';
import '../../widgets/common.dart';
import 'activity_screen.dart';
import 'customers_screen.dart';
import 'deals_admin_screen.dart';
import 'menu_pdf_admin_screen.dart';
import 'reports_screen.dart';
import 'settings_screen.dart';
import 'staff_access_screen.dart';
import 'storage_screen.dart';

/// The rest of the admin portal. Owner-only sections are not shown to admins (the server refuses them too).
class AdminMoreScreen extends StatelessWidget {
  const AdminMoreScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final owner = context.watch<StaffState>().user?.role == 'owner';
    final sections = <(IconData, String, String, Widget)>[
      (Icons.local_offer_outlined, 'Deals', 'Add, edit and switch deals', const DealsAdminScreen()),
      (Icons.picture_as_pdf_outlined, 'Menu PDF', 'What the menu download gives customers', const MenuPdfAdminScreen()),
      (Icons.bar_chart, 'Reports', 'Daily closing, sales, downloads', const ReportsScreen()),
      (Icons.people_outline, 'Customers & Coupons', 'Customers, discount codes', const CustomersScreen()),
      (Icons.storage_outlined, 'Storage & Backups', 'Space used, backups, screenshots', const StorageScreen()),
      if (owner) (Icons.history, 'Activity', 'Who did what', const ActivityScreen()),
      if (owner) (Icons.manage_accounts_outlined, 'Staff Access', 'Who can sign in', const StaffAccessScreen()),
      (Icons.settings_outlined, 'Shop Settings', 'Hours, delivery, payments, details', const SettingsScreen()),
    ];
    return Narrow(
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          Panel(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Column(
              children: [
                for (final (icon, title, hint, screen) in sections)
                  ListTile(
                    leading: Icon(icon, color: Brand.red),
                    title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text(hint),
                    trailing: const Icon(Icons.chevron_right, color: Brand.muted),
                    onTap: () => Navigator.push<void>(context, MaterialPageRoute(builder: (_) => screen)),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
