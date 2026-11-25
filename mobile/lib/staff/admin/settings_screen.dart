import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../state/auth_state.dart';
import '../../state/site_state.dart';
import '../../utils/format.dart';
import '../../widgets/common.dart';
import 'admin_common.dart';

/// Shop settings, section by section, saved the same way as on the website. Payment accounts and shop details are
/// for the owner only.
class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final owner = context.watch<StaffState>().user?.role == 'owner';
    return AdminPage(
      title: 'Shop Settings',
      child: Loaded(
        '/api/admin/settings',
        builder: (context, data, reload) {
          final s = data['settings'] as Map<String, dynamic>? ?? const {};
          Map<String, dynamic> of(String key) => Map<String, dynamic>.from(s[key] as Map? ?? const {});
          return [
            _Section(
              title: 'Open / closed for orders',
              hint: 'Turn off to stop new orders (holiday or rush).',
              settingKey: 'ordering',
              value: of('ordering'),
              fields: const [
                _Bool('open', 'Accepting new orders'),
                _Text('notice', 'Message shown to customers'),
                _When('reopen_at', 'Reopens at (optional, shop time)'),
              ],
              build: (v) => {'open': v['open'] == true, 'notice': '${v['notice'] ?? ''}', 'reopen_at': v['reopen_at']},
            ),
            _Section(
              title: 'Delivery',
              settingKey: 'delivery',
              value: of('delivery'),
              fields: const [
                _Bool('enabled', 'Home delivery available'),
                _Bool('hours_enabled', 'Only deliver during set hours'),
                _Clock('start_time', 'Delivery starts'),
                _Clock('end_time', 'Delivery stops'),
                _Number('radius_m', 'Delivery radius (metres)'),
                _Number('fee', 'Delivery fee (Rs.)'),
                _Number('free_over', 'Free delivery above (Rs., 0 = never)'),
                _Number('min_order', 'Minimum order (Rs., 0 = none)'),
              ],
              build: (v) => {
                for (final k in ['enabled', 'radius_m', 'fee', 'free_over', 'min_order']) k: v[k],
                'hours_enabled': v['hours_enabled'] == true,
                'start_time': v['start_time'] ?? '11:00',
                'end_time': v['end_time'] ?? '23:00',
              },
            ),
            _Section(title: 'Pickup', settingKey: 'pickup', value: of('pickup'), fields: const [_Bool('enabled', 'Pickup available')]),
            if (owner)
              _PaymentSection(value: of('payment'))
            else
              const Padding(padding: EdgeInsets.only(bottom: 10), child: Panel(child: Muted('Payment accounts and shop details can only be changed by the owner.'))),
            _Section(
              title: 'Loyalty points',
              settingKey: 'loyalty',
              value: of('loyalty'),
              fields: const [_Bool('enabled', 'Loyalty points enabled'), _Number('points_per_100', 'Points earned per Rs. 100 spent')],
            ),
            _Section(
              title: 'Automatic backups',
              settingKey: 'backup',
              value: of('backup'),
              fields: const [_Bool('enabled', 'Automatic backups on'), _Number('every_hours', 'Back up every (hours)'), _Number('keep', 'Keep the latest (backups)')],
            ),
            _Section(
              title: 'Storage limits & alerts',
              settingKey: 'storage',
              value: of('storage'),
              fields: const [
                _Bool('alerts', 'Email owner and admin when storage is filling up'),
                _Number('db_limit_mb', 'Database limit (MB)'),
                _Number('files_limit_mb', 'Files limit (MB)'),
                _Number('warn_percent', 'Warn at (% full, 50 to 95)'),
              ],
            ),
            if (owner)
              _Section(
                title: 'Shop details',
                hint: 'The location is the centre of the delivery radius.',
                settingKey: 'shop',
                value: of('shop'),
                fields: const [
                  _Text('name', 'Shop name'),
                  _Text('tagline', 'Tagline (on the menu PDF)'),
                  _Text('phone', 'Phone'),
                  _Text('whatsapp', 'WhatsApp number (with country code, 92...)'),
                  _Text('email', 'Email'),
                  _Clock('open_time', 'Opens at (daily, shop time)'),
                  _Clock('close_time', 'Closes at (daily)'),
                  _Text('maps_url', 'Google Maps link'),
                  _Number('lat', 'Latitude'),
                  _Number('lng', 'Longitude'),
                  _Text('address', 'Address'),
                ],
                // The readable opening hours shown to customers follow the two clock times.
                build: (v) => {
                  ...v,
                  'lat': num.tryParse('${v['lat']}'),
                  'lng': num.tryParse('${v['lng']}'),
                  'hours': '${clockText('${v['open_time'] ?? '08:00'}')} - ${clockText('${v['close_time'] ?? '23:00'}')}',
                },
              ),
          ];
        },
      ),
    );
  }
}

/// '23:00' -> '11:00 PM'.
String clockText(String hhmm) {
  final p = hhmm.split(':');
  final h = int.tryParse(p.first) ?? 0;
  return '${h % 12 == 0 ? 12 : h % 12}:${p.length > 1 ? p[1] : '00'} ${h < 12 ? 'AM' : 'PM'}';
}

sealed class _Input {
  const _Input(this.key, this.label);

  final String key;
  final String label;
}

class _Bool extends _Input {
  const _Bool(super.key, super.label);
}

class _Text extends _Input {
  const _Text(super.key, super.label);
}

class _Number extends _Input {
  const _Number(super.key, super.label);
}

class _Clock extends _Input {
  const _Clock(super.key, super.label);
}

class _When extends _Input {
  const _When(super.key, super.label);
}

class _Section extends StatefulWidget {
  const _Section({required this.title, required this.settingKey, required this.value, required this.fields, this.hint, this.build});

  final String title;
  final String settingKey;
  final String? hint;
  final Map<String, dynamic> value;
  final List<_Input> fields;

  /// What is sent; by default the section's values as they are.
  final Map<String, dynamic> Function(Map<String, dynamic>)? build;

  @override
  State<_Section> createState() => _SectionState();
}

class _SectionState extends State<_Section> {
  /// Started from the first answer and then owned by the form, so a background refresh never overwrites typing.
  late final Map<String, dynamic> _v = Map<String, dynamic>.from(widget.value);
  late final Map<String, TextEditingController> _text = {
    for (final f in widget.fields)
      if (f is _Text || f is _Number) f.key: TextEditingController(text: '${_v[f.key] ?? ''}'),
  };
  bool _busy = false;

  @override
  void dispose() {
    for (final c in _text.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    FocusScope.of(context).unfocus();
    for (final f in widget.fields) {
      if (f is _Text) _v[f.key] = _text[f.key]!.text.trim();
      if (f is _Number) {
        final n = num.tryParse(_text[f.key]!.text.trim());
        if (n == null) return fail(context, '${f.label} must be a number.');
        _v[f.key] = n;
      }
    }
    setState(() => _busy = true);
    final site = context.read<SiteState?>();
    final body = widget.build?.call(_v) ?? _v;
    if (await act(context, (api) => api.put('/api/admin/settings', {'key': widget.settingKey, 'value': body}), done: '${widget.title}: saved')) {
      site?.refresh(); // the customer side of this phone shows the change too
    }
    if (mounted) setState(() => _busy = false);
  }

  Widget _input(_Input f) {
    switch (f) {
      case _Bool():
        return SwitchRow(f.label, _v[f.key] == true, (x) => setState(() => _v[f.key] = x));
      case _Text() || _Number():
        return Field(f.label, _text[f.key]!, number: f is _Number);
      case _Clock():
        final current = '${_v[f.key] ?? (f.key.startsWith('open') || f.key.startsWith('start') ? '08:00' : '23:00')}';
        return ListTile(
          contentPadding: EdgeInsets.zero,
          dense: true,
          title: Text(f.label),
          trailing: OutlinedButton(
            onPressed: () async {
              final p = current.split(':');
              final picked = await showTimePicker(context: context, initialTime: TimeOfDay(hour: int.parse(p[0]), minute: int.parse(p[1])));
              if (picked != null) setState(() => _v[f.key] = '${'${picked.hour}'.padLeft(2, '0')}:${'${picked.minute}'.padLeft(2, '0')}');
            },
            child: Text(clockText(current)),
          ),
        );
      case _When():
        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: ShopDateTimeField(label: f.label, value: parseDate(_v[f.key]), onChanged: (d) => setState(() => _v[f.key] = d?.toUtc().toIso8601String())),
        );
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Panel(
          title: widget.title,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (widget.hint != null) ...[Muted(widget.hint!), const Gap()],
              for (final f in widget.fields) _input(f),
              const Gap(height: 6),
              BusyButton(busy: _busy, onPressed: _save, label: 'Save ${widget.title.toLowerCase()}'),
            ],
          ),
        ),
      );
}

/// Bank, JazzCash and EasyPaisa accounts customers pay into (owner only).
class _PaymentSection extends StatefulWidget {
  const _PaymentSection({required this.value});

  final Map<String, dynamic> value;

  @override
  State<_PaymentSection> createState() => _PaymentSectionState();
}

class _PaymentSectionState extends State<_PaymentSection> {
  static const _accounts = {
    'bank': ('Bank transfer', [('bank_name', 'Bank name'), ('account_title', 'Account title'), ('account_number', 'Account number'), ('iban', 'IBAN')]),
    'jazzcash': ('JazzCash', [('number', 'Mobile number'), ('title', 'Account title')]),
    'easypaisa': ('EasyPaisa', [('number', 'Mobile number'), ('title', 'Account title')]),
  };

  late final Map<String, bool> _on = {for (final k in _accounts.keys) k: (widget.value[k] as Map?)?['enabled'] == true};
  late final Map<String, TextEditingController> _text = {
    for (final MapEntry(key: k, value: (_, fields)) in _accounts.entries)
      for (final (f, _) in fields) '$k.$f': TextEditingController(text: '${(widget.value[k] as Map?)?[f] ?? ''}'),
  };
  late final _instructions = TextEditingController(text: '${widget.value['instructions'] ?? ''}');
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [..._text.values, _instructions]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    FocusScope.of(context).unfocus();
    final body = <String, dynamic>{
      for (final MapEntry(key: k, value: (_, fields)) in _accounts.entries)
        k: {'enabled': _on[k], for (final (f, _) in fields) f: _text['$k.$f']!.text.trim()},
      'instructions': _instructions.text.trim(),
    };
    if (!await confirm(context, 'Save these payment accounts? Customers will be told to send money to them.', yes: 'Save', no: 'Back')) return;
    if (!mounted) return;
    setState(() => _busy = true);
    await act(context, (api) => api.put('/api/admin/settings', {'key': 'payment', 'value': body}), done: 'Payment accounts saved');
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Panel(
          title: 'Payment accounts',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Muted('Customers see these when paying by transfer.'),
              for (final MapEntry(key: k, value: (name, fields)) in _accounts.entries) ...[
                SwitchRow(name, _on[k]!, (x) => setState(() => _on[k] = x)),
                if (_on[k]!)
                  for (final (f, label) in fields) Field(label, _text['$k.$f']!),
              ],
              Field('Instructions shown to customers', _instructions, lines: 2, max: 600),
              BusyButton(busy: _busy, onPressed: _save, label: 'Save payment accounts'),
            ],
          ),
        ),
      );
}
