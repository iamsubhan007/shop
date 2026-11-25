import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';

class Customer {
  const Customer({required this.id, required this.email, this.fullName = '', this.phone = ''});

  final String id;
  final String email;
  final String fullName;
  final String phone;

  bool get complete => fullName.isNotEmpty && phone.isNotEmpty;

  factory Customer.fromJson(Map<String, dynamic> j) => Customer(
        id: '${j['id']}',
        email: '${j['email']}',
        fullName: '${j['fullName'] ?? ''}',
        phone: '${j['phone'] ?? ''}',
      );
}

/// Customer sign-in: a one-time code by email, no password (same accounts as the website).
class AuthState extends ChangeNotifier {
  AuthState(this.api);

  final ApiClient api;
  Customer? user;

  bool get signedIn => user != null;

  Future<void> load() async {
    if (!await api.hasSession(Session.customer)) return;
    try {
      final j = await api.get('/api/auth/me', session: Session.customer);
      final u = j['user'];
      if (u is Map<String, dynamic>) {
        user = Customer.fromJson(u);
      } else {
        user = null;
        await api.forget(Session.customer);
      }
      notifyListeners();
    } on ApiException {
      // Offline at launch: keep the token and try again later.
    }
  }

  /// Returns the number of seconds to wait before another code can be sent.
  Future<int> requestCode(String email) async {
    final j = await api.post('/api/auth/otp/request', body: {'email': email.trim()});
    return (j['cooldownS'] as num?)?.toInt() ?? 60;
  }

  Future<Customer> verifyCode(String email, String code) async {
    final j = await api.post('/api/auth/otp/verify', body: {'email': email.trim(), 'code': code.trim()});
    user = Customer.fromJson(j['user'] as Map<String, dynamic>);
    notifyListeners();
    return user!;
  }

  Future<void> updateProfile(String fullName, String phone) async {
    final j = await api.patch('/api/auth/me', session: Session.customer, body: {'fullName': fullName, 'phone': phone});
    user = Customer.fromJson(j['user'] as Map<String, dynamic>);
    notifyListeners();
  }

  Future<void> signOut() async {
    try {
      await api.post('/api/auth/logout', session: Session.customer, body: {'scope': 'customer'});
    } on ApiException {
      // Signing out on this phone still works without a connection.
    }
    await _clear();
  }

  /// The server said the session is no longer valid.
  Future<void> expired() => _clear();

  Future<void> _clear() async {
    await api.forget(Session.customer);
    user = null;
    notifyListeners();
  }
}

class StaffUser {
  const StaffUser({required this.id, required this.email, required this.role, this.fullName = ''});

  final String id;
  final String email;
  final String role;
  final String fullName;

  String get name => fullName.isEmpty ? email : fullName;
  bool get isAdmin => role == 'owner' || role == 'admin';
  bool get isRider => role == 'rider';

  factory StaffUser.fromJson(Map<String, dynamic> j) => StaffUser(
        id: '${j['id']}',
        email: '${j['email']}',
        role: '${j['role']}',
        fullName: '${j['fullName'] ?? ''}',
      );
}

/// Staff sign-in (owner, admin, kitchen, rider). A staff phone reopens straight into the staff screens, even
/// when it starts without a connection.
class StaffState extends ChangeNotifier {
  StaffState(this.api, this.prefs) : staffMode = prefs.getBool(_modeKey) ?? false {
    user = _remembered();
  }

  static const _modeKey = 'staff_mode';
  static const _userKey = 'staff_user';

  final ApiClient api;
  final SharedPreferences prefs;
  StaffUser? user;
  bool staffMode;

  /// The last answer to each staff screen's request, so a screen opens at once while fresh data loads. Kept only
  /// while the app is open, and dropped on sign-out (it holds customer details).
  final cache = <String, Map<String, dynamic>>{};

  /// The server ended the session while this phone was signed in (staff sessions last 12 hours).
  bool sessionEnded = false;

  bool get showStaffScreens => staffMode && user != null;

  /// Said out loud rather than quietly showing the customer menu: nobody would be watching for orders.
  bool get showSessionEnded => staffMode && user == null && sessionEnded;

  StaffUser? _remembered() {
    try {
      final raw = prefs.getString(_userKey);
      return raw == null ? null : StaffUser.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<void> load() async {
    if (!await api.hasSession(Session.staff)) {
      if (user != null) await _end();
      return;
    }
    try {
      await _fetchMe();
    } on ApiException {
      // Offline at launch: carry on with the remembered person.
    }
  }

  Future<void> _fetchMe() async {
    final j = await api.get('/api/auth/me', session: Session.staff, query: {'scope': 'staff'});
    final u = j['user'];
    if (u is Map<String, dynamic>) {
      _signedIn(u);
      notifyListeners();
    } else {
      await _end();
    }
  }

  void _signedIn(Map<String, dynamic> json) {
    final next = StaffUser.fromJson(json);
    if (user != null && (user!.id != next.id || user!.role != next.role)) cache.clear();
    user = next;
    sessionEnded = false;
    prefs.setString(_userKey, jsonEncode(json));
  }

  Future<void> _end() async {
    cache.clear();
    await api.forget(Session.staff);
    if (user != null) sessionEnded = true;
    user = null;
    await prefs.remove(_userKey);
    notifyListeners();
  }

  /// Staff requests answer 403 both for "your session ended" and for "your role may not do this".
  /// Only the first should sign the person out, so ask the server which it was.
  Future<void> checkAfterRefusal() async {
    try {
      await _fetchMe();
    } on ApiException {
      // Leave things as they are.
    }
  }

  Future<int> requestCode(String email) async {
    final j = await api.post('/api/auth/staff/otp/request', body: {'email': email.trim()});
    return (j['cooldownS'] as num?)?.toInt() ?? 60;
  }

  Future<void> verifyCode(String email, String code) async {
    final j = await api.post('/api/auth/staff/otp/verify', body: {'email': email.trim(), 'code': code.trim()});
    _signedIn(j['user'] as Map<String, dynamic>);
    setStaffMode(true);
  }

  void setStaffMode(bool value) {
    staffMode = value;
    if (!value) sessionEnded = false;
    prefs.setBool(_modeKey, value);
    notifyListeners();
  }

  Future<void> signOut() async {
    try {
      await api.post('/api/auth/logout', session: Session.staff, body: {'scope': 'staff'});
    } on ApiException {
      // Signing out on this phone still works without a connection.
    }
    cache.clear();
    await api.forget(Session.staff);
    user = null;
    await prefs.remove(_userKey);
    setStaffMode(false);
  }
}
