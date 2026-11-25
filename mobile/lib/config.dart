/// Where the app talks to. The app has no server of its own: it uses the same API as the website, so orders,
/// menu and settings are shared with it.
///
/// Point a build somewhere else with: --dart-define=API_BASE=https://example.com
class AppConfig {
  static const apiBase = String.fromEnvironment('API_BASE', defaultValue: 'https://hbt-ns.vercel.app');

  static const appName = 'Haq Bahu Tandoor';

  /// Keep in step with `version:` in pubspec.yaml (a test checks it).
  static const version = '1.1.0';
  static const foodpandaUrl = 'https://www.foodpanda.pk/restaurant/w6kj/haq-bahu-naan-shop';
  static const chatPath = '/Chat';
  static const bannerPath = '/bannerHBT1.png';
}
