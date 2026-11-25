import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../screens/sign_in_screen.dart';
import '../state/auth_state.dart';
import '../widgets/common.dart';

/// Shown on a staff phone when its session runs out, so nobody believes it is still watching for orders.
class StaffSessionEnded extends StatelessWidget {
  const StaffSessionEnded({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Staff')),
        body: EmptyState(
          icon: Icons.notifications_off_outlined,
          title: 'Your staff session ended',
          message: 'New orders will not ring on this phone until you sign in again.',
          action: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              FilledButton(
                onPressed: () => Navigator.push<void>(context, MaterialPageRoute(builder: (_) => const SignInScreen(staff: true))),
                child: const Text('Sign in again'),
              ),
              TextButton(
                onPressed: () => context.read<StaffState>().setStaffMode(false),
                child: const Text('Use the customer app'),
              ),
            ],
          ),
        ),
      );
}
