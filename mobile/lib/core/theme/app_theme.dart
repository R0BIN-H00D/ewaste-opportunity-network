import 'package:material_ui/material_ui.dart';
import 'app_colors.dart';
import 'glass_theme.dart';

/// Explicit ColorScheme (not fromSeed) so the palette matches the web design tokens exactly.
class AppTheme {
  static const _headingFont = 'PlusJakartaSans'; // falls back to platform font until assets are added
  static const _bodyFont = 'Inter';

  static TextTheme _text(Color body, Color muted) => TextTheme(
        displayLarge: TextStyle(fontFamily: _headingFont, fontSize: 56, fontWeight: FontWeight.w800, height: 1.05, letterSpacing: -1, color: body),
        headlineLarge: TextStyle(fontFamily: _headingFont, fontSize: 36, fontWeight: FontWeight.w800, height: 1.15, color: body),
        headlineMedium: TextStyle(fontFamily: _headingFont, fontSize: 28, fontWeight: FontWeight.w700, height: 1.2, color: body),
        titleLarge: TextStyle(fontFamily: _headingFont, fontSize: 20, fontWeight: FontWeight.w700, height: 1.3, color: body),
        bodyLarge: TextStyle(fontFamily: _bodyFont, fontSize: 16, height: 1.6, color: body),
        bodyMedium: TextStyle(fontFamily: _bodyFont, fontSize: 14, height: 1.5, color: muted),
        labelSmall: TextStyle(fontFamily: _bodyFont, fontSize: 12, fontWeight: FontWeight.w600, height: 1.4, color: muted),
      );

  static ThemeData light() {
    const scheme = ColorScheme(
      brightness: Brightness.light,
      primary: AppColors.primary,
      onPrimary: Colors.white,
      secondary: AppColors.secondaryStrong,
      onSecondary: Colors.white,
      error: AppColors.danger,
      onError: Colors.white,
      surface: AppColors.surfaceLight,
      onSurface: AppColors.textLight,
    );
    return _base(scheme, AppColors.bgLight, _text(AppColors.textLight, AppColors.textMutedLight), GlassTheme.light);
  }

  static ThemeData dark() {
    const scheme = ColorScheme(
      brightness: Brightness.dark,
      primary: AppColors.primaryTint,
      onPrimary: AppColors.bgDark,
      secondary: AppColors.secondary,
      onSecondary: AppColors.bgDark,
      error: Color(0xFFF87171),
      onError: AppColors.bgDark,
      surface: AppColors.surfaceDark,
      onSurface: AppColors.textDark,
    );
    return _base(scheme, AppColors.bgDark, _text(AppColors.textDark, AppColors.textMutedDark), GlassTheme.dark);
  }

  static ThemeData _base(ColorScheme scheme, Color bg, TextTheme text, GlassTheme glass) => ThemeData(
        useMaterial3: true,
        colorScheme: scheme,
        scaffoldBackgroundColor: bg,
        textTheme: text,
        extensions: [glass],
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            minimumSize: const Size(48, 48),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: glass.background,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
}
