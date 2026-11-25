import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../state/auth_state.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../widgets/common.dart';

/// Email → one-time code → name and mobile number. Pops `true` once signed in with a complete profile.
///
/// With [staff] set it is the staff sign-in: same code flow, no profile step.
class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key, this.staff = false, this.editProfile = false});

  final bool staff;
  final bool editProfile;

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

enum _Step { email, code, profile }

class _SignInScreenState extends State<SignInScreen> {
  final _email = TextEditingController();
  final _code = TextEditingController();
  final _name = TextEditingController();
  final _phone = TextEditingController();

  _Step _step = _Step.email;
  bool _busy = false;
  String? _error;
  int _cooldown = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    if (!widget.staff) {
      final user = context.read<AuthState>().user;
      if (user != null && (widget.editProfile || !user.complete)) _showProfile(user);
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _email.dispose();
    _code.dispose();
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  void _showProfile(Customer user) {
    _name.text = user.fullName;
    _phone.text = user.phone;
    _step = _Step.profile;
  }

  void _startCooldown(int seconds) {
    _timer?.cancel();
    _cooldown = seconds;
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      setState(() => _cooldown--);
      if (_cooldown <= 0) t.cancel();
    });
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          // A code was already sent a moment ago: go to the code box and count down.
          final retry = e.body['retryAfterS'];
          if (retry is num) {
            _startCooldown(retry.toInt());
            if (_step == _Step.email) _step = _Step.code;
          }
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _sendCode() async {
    if (!looksLikeEmail(_email.text)) {
      setState(() => _error = 'Please enter a valid email address.');
      return;
    }
    await _run(() async {
      final email = _email.text;
      final wait = widget.staff
          ? await context.read<StaffState>().requestCode(email)
          : await context.read<AuthState>().requestCode(email);
      if (!mounted) return;
      setState(() {
        _startCooldown(wait);
        _step = _Step.code;
      });
    });
  }

  Future<void> _verify() async {
    if (_code.text.length != 6) {
      setState(() => _error = 'Enter the 6-digit code.');
      return;
    }
    await _run(() async {
      final navigator = Navigator.of(context);
      if (widget.staff) {
        await context.read<StaffState>().verifyCode(_email.text, _code.text);
        navigator.popUntil((route) => route.isFirst);
        return;
      }
      final user = await context.read<AuthState>().verifyCode(_email.text, _code.text);
      if (!mounted) return;
      if (user.complete) {
        navigator.pop(true);
      } else {
        setState(() => _showProfile(user));
      }
    });
  }

  Future<void> _saveProfile() async {
    if (_name.text.trim().length < 2) {
      setState(() => _error = 'Please enter your name.');
      return;
    }
    if (normalizePkPhone(_phone.text) == null) {
      setState(() => _error = 'Enter a valid Pakistani mobile number, e.g. 03XXXXXXXXX.');
      return;
    }
    await _run(() async {
      final navigator = Navigator.of(context);
      await context.read<AuthState>().updateProfile(_name.text.trim(), _phone.text.trim());
      navigator.pop(true);
    });
  }

  @override
  Widget build(BuildContext context) {
    final title = switch (_step) {
      _Step.profile => widget.editProfile ? 'Your details' : 'Almost there',
      _ => widget.staff ? 'Staff sign in' : 'Sign in to order',
    };
    final subtitle = switch (_step) {
      _Step.email => 'No password needed. We email you a one-time code.',
      _Step.code => 'We sent a 6-digit code to ${_email.text.trim()}',
      _Step.profile => 'Tell us who to contact about your order.',
    };

    return Scaffold(
      appBar: AppBar(),
      body: Narrow(
        maxWidth: 460,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Center(
              child: Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(color: Brand.red, borderRadius: BorderRadius.circular(16)),
                child: Icon(widget.staff ? Icons.badge_outlined : Icons.verified_user_outlined, color: Colors.white),
              ),
            ),
            const SizedBox(height: 14),
            Text(title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
            const SizedBox(height: 4),
            Text(subtitle, textAlign: TextAlign.center, style: const TextStyle(color: Brand.muted, fontSize: 13)),
            const SizedBox(height: 20),
            if (_error != null) ...[Notice(_error!), const SizedBox(height: 12)],
            ..._fields(),
          ],
        ),
      ),
    );
  }

  List<Widget> _fields() => switch (_step) {
        _Step.email => [
            TextField(
              key: const ValueKey('email'),
              controller: _email,
              autofocus: true,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              autocorrect: false,
              onSubmitted: (_) => _sendCode(),
              decoration: const InputDecoration(labelText: 'Email address', prefixIcon: Icon(Icons.mail_outline)),
            ),
            const SizedBox(height: 14),
            BusyButton(busy: _busy, onPressed: _sendCode, label: 'Send code'),
          ],
        _Step.code => [
            TextField(
              key: const ValueKey('code'),
              controller: _code,
              autofocus: true,
              keyboardType: TextInputType.number,
              textAlign: TextAlign.center,
              autofillHints: const [AutofillHints.oneTimeCode],
              style: const TextStyle(fontSize: 26, letterSpacing: 10, fontWeight: FontWeight.w800),
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
              onSubmitted: (_) => _verify(),
              decoration: const InputDecoration(hintText: '••••••'),
            ),
            const SizedBox(height: 12),
            const Notice("Haven't received your code yet? Please check your Spam/Junk folder as well.", kind: NoticeKind.warning),
            const SizedBox(height: 12),
            BusyButton(busy: _busy, onPressed: _verify, label: 'Verify & continue'),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                TextButton(
                  onPressed: () => setState(() {
                    _step = _Step.email;
                    _code.clear();
                    _error = null;
                  }),
                  child: const Text('Change email'),
                ),
                TextButton(
                  onPressed: _cooldown > 0 || _busy ? null : _sendCode,
                  child: Text(_cooldown > 0 ? 'Resend code in ${_cooldown}s' : 'Resend code'),
                ),
              ],
            ),
          ],
        _Step.profile => [
            TextField(
              key: const ValueKey('name'),
              controller: _name,
              textCapitalization: TextCapitalization.words,
              autofillHints: const [AutofillHints.name],
              maxLength: 80,
              decoration: const InputDecoration(labelText: 'Full name', prefixIcon: Icon(Icons.person_outline), counterText: ''),
            ),
            const SizedBox(height: 12),
            TextField(
              key: const ValueKey('phone'),
              controller: _phone,
              keyboardType: TextInputType.phone,
              autofillHints: const [AutofillHints.telephoneNumber],
              onSubmitted: (_) => _saveProfile(),
              decoration: const InputDecoration(labelText: 'Mobile number', hintText: '03XX XXXXXXX', prefixIcon: Icon(Icons.phone_outlined)),
            ),
            const SizedBox(height: 14),
            BusyButton(busy: _busy, onPressed: _saveProfile, label: 'Save & continue'),
          ],
      };
}
