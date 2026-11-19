import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'app_colors.dart';
import 'glass_theme.dart';

/// Explicit ColorScheme (not fromSeed) so the palette matches the web design tokens exactly.
/// Every screen inherits its buttons, fields, dialogs, sheets and type from here, so the look stays in one place.
class AppTheme {
  static const _headingFont = 'PlusJakartaSans';
  static const _bodyFont = 'Inter';

  static TextTheme _text(Color body, Color muted) => TextTheme(
        displayLarge: TextStyle(fontFamily: _headingFont, fontSize: 56, fontWeight: FontWeight.w800, height: 1.05, letterSpacing: -1, color: body),
        headlineLarge: TextStyle(fontFamily: _headingFont, fontSize: 34, fontWeight: FontWeight.w800, height: 1.15, letterSpacing: -0.5, color: body),
        headlineMedium: TextStyle(fontFamily: _headingFont, fontSize: 26, fontWeight: FontWeight.w800, height: 1.2, letterSpacing: -0.3, color: body),
        headlineSmall: TextStyle(fontFamily: _headingFont, fontSize: 22, fontWeight: FontWeight.w700, height: 1.25, letterSpacing: -0.2, color: body),
        titleLarge: TextStyle(fontFamily: _headingFont, fontSize: 19, fontWeight: FontWeight.w700, height: 1.3, letterSpacing: -0.1, color: body),
        titleMedium: TextStyle(fontFamily: _headingFont, fontSize: 16, fontWeight: FontWeight.w700, height: 1.35, color: body),
        titleSmall: TextStyle(fontFamily: _headingFont, fontSize: 14, fontWeight: FontWeight.w700, height: 1.35, color: body),
        bodyLarge: TextStyle(fontFamily: _bodyFont, fontSize: 16, height: 1.55, color: body),
        bodyMedium: TextStyle(fontFamily: _bodyFont, fontSize: 14, height: 1.5, color: muted),
        bodySmall: TextStyle(fontFamily: _bodyFont, fontSize: 12.5, height: 1.45, color: muted),
        labelLarge: TextStyle(fontFamily: _headingFont, fontSize: 15, fontWeight: FontWeight.w700, letterSpacing: 0.1, color: body),
        labelMedium: TextStyle(fontFamily: _bodyFont, fontSize: 13, fontWeight: FontWeight.w600, height: 1.4, color: muted),
        labelSmall: TextStyle(fontFamily: _bodyFont, fontSize: 12, fontWeight: FontWeight.w600, height: 1.4, color: muted),
      );

  static ThemeData light() {
    const scheme = ColorScheme(
      brightness: Brightness.light,
      primary: AppColors.primary,
      onPrimary: Colors.white,
      primaryContainer: Color(0xFFD6F2E1),
      onPrimaryContainer: Color(0xFF0F3D22),
      secondary: AppColors.secondaryStrong,
      onSecondary: Colors.white,
      secondaryContainer: Color(0xFFD1FAE5),
      onSecondaryContainer: Color(0xFF064E3B),
      error: AppColors.danger,
      onError: Colors.white,
      surface: AppColors.surfaceLight,
      onSurface: AppColors.textLight,
      outline: Color(0xFFD5DED8),
      outlineVariant: Color(0xFFE6ECE8),
    );
    return _base(scheme, AppColors.bgLight, _text(AppColors.textLight, AppColors.textMutedLight), GlassTheme.light);
  }

  static ThemeData dark() {
    const scheme = ColorScheme(
      brightness: Brightness.dark,
      primary: AppColors.primaryTint,
      onPrimary: AppColors.bgDark,
      primaryContainer: Color(0xFF14452F),
      onPrimaryContainer: Color(0xFFBFF5D8),
      secondary: AppColors.secondary,
      onSecondary: AppColors.bgDark,
      secondaryContainer: Color(0xFF1B4D3A),
      onSecondaryContainer: Color(0xFFC7F5DD),
      error: Color(0xFFF87171),
      onError: AppColors.bgDark,
      surface: AppColors.surfaceDark,
      onSurface: AppColors.textDark,
      outline: Color(0xFF2E4A3C),
      outlineVariant: Color(0xFF1F362B),
    );
    return _base(scheme, AppColors.bgDark, _text(AppColors.textDark, AppColors.textMutedDark), GlassTheme.dark);
  }

  static ThemeData _base(ColorScheme scheme, Color bg, TextTheme text, GlassTheme glass) {
    final dark = scheme.brightness == Brightness.dark;
    final fieldBorder = OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: scheme.outline));
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: bg,
      textTheme: text,
      extensions: [glass],
      splashFactory: InkSparkle.splashFactory,
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: text.titleLarge,
        iconTheme: IconThemeData(color: scheme.onSurface),
        systemOverlayStyle: dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(48, 52),
          padding: const EdgeInsets.symmetric(horizontal: 22),
          textStyle: text.labelLarge,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(48, 52),
          padding: const EdgeInsets.symmetric(horizontal: 22),
          textStyle: text.labelLarge,
          side: BorderSide(color: scheme.outline),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          minimumSize: const Size(48, 44),
          textStyle: text.labelLarge,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: glass.field,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        labelStyle: text.bodyMedium,
        hintStyle: text.bodyMedium?.copyWith(color: text.bodyMedium?.color?.withValues(alpha: 0.7)),
        border: fieldBorder,
        enabledBorder: fieldBorder,
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: scheme.primary, width: 1.8)),
        errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: scheme.error)),
        focusedErrorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: scheme.error, width: 1.8)),
      ),
      chipTheme: ChipThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        side: BorderSide(color: scheme.outline),
        labelStyle: text.labelMedium,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        titleTextStyle: text.titleLarge,
        contentTextStyle: text.bodyMedium,
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: dark ? const Color(0xFF1D3629) : AppColors.textLight,
        contentTextStyle: text.bodyMedium?.copyWith(color: Colors.white),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      dividerTheme: DividerThemeData(color: scheme.outlineVariant, space: 1, thickness: 1),
      listTileTheme: ListTileThemeData(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: scheme.primary),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: scheme.primary,
        foregroundColor: scheme.onPrimary,
        elevation: 4,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      ),
      switchTheme: SwitchThemeData(
        trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? scheme.primary : scheme.outline),
        thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? scheme.onPrimary : (dark ? AppColors.textMutedDark : Colors.white)),
        trackOutlineColor: WidgetStateProperty.all(Colors.transparent),
      ),
    );
  }
}
