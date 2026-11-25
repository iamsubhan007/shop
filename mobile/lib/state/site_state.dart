import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';
import '../models/menu.dart';
import '../models/settings.dart';

/// Menu and shop settings. The last copy is kept on the phone so the menu appears straight away on the next launch.
class SiteState extends ChangeNotifier {
  SiteState(this.api, this.prefs) {
    _readCache();
  }

  static const _menuKey = 'cache_menu';
  static const _settingsKey = 'cache_settings';

  final ApiClient api;
  final SharedPreferences prefs;

  MenuData? menu;
  ShopSettings? settings;
  bool loading = false;
  String? error;

  void _readCache() {
    try {
      final m = prefs.getString(_menuKey);
      final s = prefs.getString(_settingsKey);
      if (m != null) menu = MenuData.fromJson(jsonDecode(m) as Map<String, dynamic>);
      if (s != null) settings = ShopSettings(jsonDecode(s) as Map<String, dynamic>);
    } catch (_) {
      menu = null;
      settings = null;
    }
  }

  Future<void> refresh() async {
    if (loading) return;
    loading = true;
    notifyListeners();
    try {
      final results = await Future.wait([api.get('/api/menu'), api.get('/api/settings')]);
      menu = MenuData.fromJson(results[0]);
      settings = ShopSettings(results[1]);
      error = null;
      await prefs.setString(_menuKey, jsonEncode(results[0]));
      await prefs.setString(_settingsKey, jsonEncode(results[1]));
    } on ApiException catch (e) {
      error = e.message;
    } catch (_) {
      error = 'Could not load the menu.';
    } finally {
      loading = false;
      notifyListeners();
    }
  }
}
