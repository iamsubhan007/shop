import 'package:material_ui/material_ui.dart';

/// The website's colours (Tailwind red-700, zinc and the warm off-white page background).
class Brand {
  static const red = Color(0xFFB91C1C);
  static const redSoft = Color(0xFFFEF2F2);
  static const ink = Color(0xFF09090B);
  static const inkSoft = Color(0xFF27272A);
  static const bg = Color(0xFFF9F7F5);
  static const line = Color(0xFFE4E4E7);
  static const muted = Color(0xFF71717A);
  static const amber = Color(0xFFFCD34D);
  static const amberSoft = Color(0xFFFFFBEB);
  static const amberInk = Color(0xFF78350F);
  static const green = Color(0xFF059669);
  static const greenSoft = Color(0xFFECFDF5);
  static const greenInk = Color(0xFF065F46);
}

/// All text is drawn a little smaller than Material's default (on top of the phone's own text-size setting).
const textShrink = 0.9;

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: Brand.red).copyWith(
    primary: Brand.red,
    onPrimary: Colors.white,
    surface: Colors.white,
    onSurface: Brand.ink,
    // Menus and dialogs stay white like the website, instead of taking a pink tint from the red seed.
    surfaceContainerLowest: Colors.white,
    surfaceContainerLow: Colors.white,
    surfaceContainer: Colors.white,
    surfaceContainerHigh: Colors.white,
    surfaceContainerHighest: const Color(0xFFF4F4F5),
    outlineVariant: Brand.line,
  );
  const radius = BorderRadius.all(Radius.circular(12));
  OutlineInputBorder border(Color c, [double w = 1]) =>
      OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: c, width: w));

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: Brand.bg,
    appBarTheme: const AppBarTheme(
      backgroundColor: Brand.ink,
      foregroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      border: border(Brand.line),
      enabledBorder: border(Brand.line),
      focusedBorder: border(Brand.red, 1.6),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(64, 46),
        shape: const RoundedRectangleBorder(borderRadius: radius),
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(64, 44),
        foregroundColor: Brand.ink,
        side: const BorderSide(color: Brand.line),
        shape: const RoundedRectangleBorder(borderRadius: radius),
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
    ),
    // A compact bottom bar: shorter than Material's 80, with smaller icons and labels.
    navigationBarTheme: NavigationBarThemeData(
      height: 58,
      backgroundColor: Colors.white,
      indicatorColor: Brand.redSoft,
      surfaceTintColor: Colors.transparent,
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(size: 19, color: states.contains(WidgetState.selected) ? Brand.red : Brand.inkSoft),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          fontSize: 11.5,
          color: states.contains(WidgetState.selected) ? Brand.red : Brand.inkSoft,
          fontWeight: states.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
        ),
      ),
    ),
    dividerTheme: const DividerThemeData(color: Brand.line, space: 1, thickness: 1),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
  );
}
