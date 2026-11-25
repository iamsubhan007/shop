import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api/api_client.dart';
import 'api/token_store.dart';
import 'config.dart';
import 'screens/home_shell.dart';
import 'staff/session_ended.dart';
import 'staff/staff_shell.dart';
import 'state/auth_state.dart';
import 'state/cart_state.dart';
import 'state/site_state.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  final api = ApiClient(baseUrl: AppConfig.apiBase, tokens: const SecureTokenStore());
  runApp(HbtApp(api: api, prefs: prefs));
}

class HbtApp extends StatelessWidget {
  const HbtApp({super.key, required this.api, required this.prefs});

  final ApiClient api;
  final SharedPreferences prefs;

  @override
  Widget build(BuildContext context) => MultiProvider(
        providers: [
          Provider<ApiClient>.value(value: api),
          ChangeNotifierProvider(create: (_) => SiteState(api, prefs)),
          ChangeNotifierProvider(create: (_) => CartState(prefs)),
          // Sessions saved on the phone are checked once at launch.
          ChangeNotifierProvider(lazy: false, create: (_) => AuthState(api)..load()),
          ChangeNotifierProvider(lazy: false, create: (_) => StaffState(api, prefs)..load()),
        ],
        child: MaterialApp(
          title: AppConfig.appName,
          debugShowCheckedModeBanner: false,
          theme: buildTheme(),
          builder: (context, child) {
            final media = MediaQuery.of(context);
            final phone = media.textScaler.scale(14) / 14;
            return MediaQuery(data: media.copyWith(textScaler: TextScaler.linear(phone * textShrink)), child: child!);
          },
          home: const _Root(),
        ),
      );
}

class _Root extends StatelessWidget {
  const _Root();

  @override
  Widget build(BuildContext context) {
    final staff = context.watch<StaffState>();
    if (staff.showStaffScreens) return const StaffShell();
    if (staff.showSessionEnded) return const StaffSessionEnded();
    return const HomeShell();
  }
}
