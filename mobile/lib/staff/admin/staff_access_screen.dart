import 'package:material_ui/material_ui.dart';

import '../../models/menu.dart' show maps;
import '../../theme.dart';
import '../../utils/format.dart';
import '../../widgets/common.dart';
import 'admin_common.dart';

const _roleHelp = {
  'admin': 'Orders, menu and stock, deals, reports, customers and shop settings.',
  'kitchen': 'The kitchen queue only (no prices, reports or settings).',
  'rider': 'Only deliveries: address, map, items and bill. Never sees phone numbers or emails.',
};

const _roleItems = [
  DropdownMenuItem(value: 'admin', child: Text('Admin')),
  DropdownMenuItem(value: 'kitchen', child: Text('Kitchen')),
  DropdownMenuItem(value: 'rider', child: Text('Rider')),
];

/// Who may sign in to the staff screens (owner only).
class StaffAccessScreen extends StatefulWidget {
  const StaffAccessScreen({super.key});

  @override
  State<StaffAccessScreen> createState() => _StaffAccessScreenState();
}

class _StaffAccessScreenState extends State<StaffAccessScreen> {
  final _email = TextEditingController();
  final _name = TextEditingController();
  String _role = 'admin';
  bool _busy = false;

  @override
  void dispose() {
    _email.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _add(Future<void> Function() reload) async {
    if (!looksLikeEmail(_email.text)) return fail(context, 'Enter a valid email address.');
    FocusScope.of(context).unfocus();
    setState(() => _busy = true);
    final email = _email.text.trim();
    final ok = await act(
      context,
      (api) => api.post('/api/admin/staff', {'email': email, if (_name.text.trim().isNotEmpty) 'fullName': _name.text.trim(), 'role': _role}),
      done: '$email can now sign in with an emailed code.',
    );
    if (ok) {
      _email.clear();
      _name.clear();
    }
    await reload();
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) => AdminPage(
        title: 'Staff Access',
        child: Loaded(
          '/api/admin/staff',
          builder: (context, data, reload) {
            final staff = maps(data['staff']);
            return [
              const Muted('Only these emails can sign in. Each sign-in needs a one-time code sent to that email, so there are no passwords to share.'),
              const Gap(),
              Panel(
                title: 'Add staff',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Field('Email', _email, keyboard: TextInputType.emailAddress),
                    Field('Name (optional)', _name, max: 80),
                    DropdownButtonFormField<String>(
                      initialValue: _role,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Role'),
                      items: _roleItems,
                      onChanged: (v) => setState(() => _role = v ?? 'admin'),
                    ),
                    const Gap(height: 6),
                    Muted(_roleHelp[_role]!),
                    const Gap(),
                    BusyButton(busy: _busy, onPressed: () => _add(reload), label: 'Add staff'),
                  ],
                ),
              ),
              const Gap(),
              for (final m in staff)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Panel(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          '${m['fullName'] ?? m['email']}${m['id'] == data['meId'] ? '  (you)' : ''}${m['isActive'] == false ? '  (disabled)' : ''}',
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                        if (m['fullName'] != null) Muted('${m['email']}'),
                        Muted(m['lastLoginAt'] == null ? 'Has not signed in yet' : 'Last sign-in ${when(parseDate(m['lastLoginAt']))}'),
                        const Gap(height: 6),
                        if (m['role'] == 'owner')
                          const Text('Owner', style: TextStyle(color: Brand.red, fontWeight: FontWeight.w800))
                        else
                          Wrap(
                            alignment: WrapAlignment.spaceBetween,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              DropdownButton<String>(
                                value: '${m['role']}',
                                items: _roleItems,
                                onChanged: (role) async {
                                  if (role == null || role == m['role']) return;
                                  await act(context, (api) => api.patch('/api/admin/staff/${m['id']}', {'role': role}), done: '${m['email']} is now $role.');
                                  await reload();
                                },
                              ),
                              TextButton.icon(
                                style: TextButton.styleFrom(foregroundColor: Brand.red),
                                onPressed: () async {
                                  if (!await confirm(context, 'Remove staff access for ${m['email']}? They are signed out and can no longer sign in.', yes: 'Remove', no: 'Keep', danger: true)) return;
                                  if (!context.mounted) return;
                                  await act(context, (api) => api.delete('/api/admin/staff/${m['id']}'), done: '${m['email']} no longer has staff access.');
                                  await reload();
                                },
                                icon: const Icon(Icons.delete_outline, size: 17),
                                label: const Text('Remove access'),
                              ),
                            ],
                          ),
                      ],
                    ),
                  ),
                ),
            ];
          },
        ),
      );
}
