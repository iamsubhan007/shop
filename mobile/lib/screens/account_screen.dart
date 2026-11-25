import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../config.dart';
import '../state/auth_state.dart';
import '../state/site_state.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/menu_pdf_button.dart';
import 'sign_in_screen.dart';

/// "More": the customer's account and how to reach the shop. Customers see nothing about the staff side.
class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final staff = context.watch<StaffState>();
    final settings = context.watch<SiteState>().settings;
    final api = context.read<ApiClient>();
    final user = auth.user;

    void signIn({bool edit = false}) =>
        Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => SignInScreen(editProfile: edit)));

    Widget link(IconData icon, String title, VoidCallback onTap, {String? subtitle, Color? color}) => ListTile(
          leading: Icon(icon, color: color ?? Brand.red),
          title: Text(title),
          subtitle: subtitle == null || subtitle.isEmpty ? null : Text(subtitle),
          trailing: const Icon(Icons.chevron_right, color: Brand.muted),
          onTap: onTap,
        );

    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: Narrow(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Panel(
              child: user == null
                  ? Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text('Sign in to order and track', style: TextStyle(fontWeight: FontWeight.w800)),
                        const SizedBox(height: 4),
                        const Text('No password: we email you a one-time code.', style: TextStyle(color: Brand.muted, fontSize: 13)),
                        const SizedBox(height: 12),
                        FilledButton(onPressed: signIn, child: const Text('Sign in')),
                      ],
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(user.fullName.isEmpty ? user.email : user.fullName, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
                        const SizedBox(height: 2),
                        Text([user.phone, user.email].where((s) => s.isNotEmpty).join(' · '), style: const TextStyle(color: Brand.muted, fontSize: 13)),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(child: OutlinedButton(onPressed: () => signIn(edit: true), child: const Text('Edit details'))),
                            const SizedBox(width: 8),
                            Expanded(child: OutlinedButton(onPressed: auth.signOut, child: const Text('Sign out'))),
                          ],
                        ),
                      ],
                    ),
            ),
            const SizedBox(height: 12),
            if (settings != null)
              Panel(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Column(
                  children: [
                    if (settings.phone.isNotEmpty)
                      link(Icons.call_outlined, 'Call us', () => openLink(context, Uri(scheme: 'tel', path: settings.phone)), subtitle: settings.phone),
                    if (settings.whatsapp.isNotEmpty)
                      link(Icons.chat_outlined, 'WhatsApp', () => openLink(context, whatsappLink(settings.whatsapp, 'Hello Haq Bahu Tandoor, I have a question.')), color: Brand.green),
                    link(
                      Icons.location_on_outlined,
                      'Find the shop',
                      () => openLink(context, settings.mapsUrl.isNotEmpty ? Uri.parse(settings.mapsUrl) : directionsLink(settings.lat, settings.lng)),
                      subtitle: settings.address,
                    ),
                    if (settings.hours.isNotEmpty)
                      ListTile(leading: const Icon(Icons.schedule, color: Brand.red), title: const Text('Opening hours'), subtitle: Text(settings.hours)),
                  ],
                ),
              ),
            const SizedBox(height: 12),
            Panel(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Column(
                children: [
                  const MenuPdfButton(asTile: true),
                  link(Icons.support_agent, 'Chat support', () => openLink(context, api.url(AppConfig.chatPath), inApp: true)),
                  link(Icons.delivery_dining, 'Order on Foodpanda', () => openLink(context, Uri.parse(AppConfig.foodpandaUrl))),
                  link(Icons.public, 'Our website', () => openLink(context, api.url('/'))),
                ],
              ),
            ),
            // Only on a phone where a staff member is already signed in.
            if (staff.user != null) ...[
              const SizedBox(height: 12),
              Panel(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: link(Icons.badge_outlined, 'Open staff screens', () => staff.setStaffMode(true), subtitle: staff.user!.name, color: Brand.ink),
              ),
            ],
            _VersionLine(staffDoor: user == null && staff.user == null),
          ],
        ),
      ),
    );
  }
}

/// The app version. Staff open their sign-in by tapping it [_taps] times in a row: there is no visible button, and
/// the taps do nothing while a customer is signed in. This only keeps the staff side out of sight; what protects it
/// is the server, which sends sign-in codes to registered staff emails only.
class _VersionLine extends StatefulWidget {
  const _VersionLine({required this.staffDoor});

  final bool staffDoor;

  @override
  State<_VersionLine> createState() => _VersionLineState();
}

class _VersionLineState extends State<_VersionLine> {
  static const _taps = 7;

  int _count = 0;
  DateTime? _last;

  void _tap() {
    if (!widget.staffDoor) return;
    final now = DateTime.now();
    // A pause starts the count again, so scrolling and stray taps never add up to it.
    if (_last == null || now.difference(_last!) > const Duration(seconds: 2)) _count = 0;
    _last = now;
    if (++_count < _taps) return;
    _count = 0;
    Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => const SignInScreen(staff: true)));
  }

  @override
  Widget build(BuildContext context) => GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: _tap,
        child: const Padding(
          padding: EdgeInsets.symmetric(vertical: 22),
          child: Text(
            '${AppConfig.appName} · version ${AppConfig.version}',
            textAlign: TextAlign.center,
            style: TextStyle(color: Brand.muted, fontSize: 11.5),
          ),
        ),
      );
}
