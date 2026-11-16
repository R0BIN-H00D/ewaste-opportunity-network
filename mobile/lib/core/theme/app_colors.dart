import 'package:material_ui/material_ui.dart';

/// Mirrors docs/design.md B.2 and web/tailwind.config.js. Do not add ad-hoc colours in widgets.
class AppColors {
  static const primary = Color(0xFF14532D);
  static const primaryHover = Color(0xFF166534);
  static const primaryTint = Color(0xFF34D399); // dark-mode primary
  static const secondary = Color(0xFF10B981);
  static const secondaryStrong = Color(0xFF047857); // meaningful icons/borders on light bg (>=4.5:1)
  static const accent = Color(0xFFA3E635);

  static const bgLight = Color(0xFFF5F8F5);
  static const bgDark = Color(0xFF0B1712);
  static const surfaceLight = Color(0xFFFFFFFF);
  static const surfaceDark = Color(0xFF12241C);

  static const textLight = Color(0xFF1F2937);
  static const textMutedLight = Color(0xFF6B7280);
  static const textDark = Color(0xFFE8F1EB);
  static const textMutedDark = Color(0xFF9FB2A7);

  static const glassLight = Color.fromRGBO(255, 255, 255, 0.65);
  static const glassBorderLight = Color.fromRGBO(255, 255, 255, 0.45);
  static const glassDark = Color.fromRGBO(20, 35, 28, 0.70);
  static const glassBorderDark = Color.fromRGBO(255, 255, 255, 0.10);

  // Page backgrounds behind the glass (top to bottom).
  static const gradientLight = [Color(0xFFE3F4EA), bgLight, Color(0xFFF0F7E6)];
  static const gradientDark = [bgDark, Color(0xFF10261C), bgDark];

  static const success = Color(0xFF16A34A);
  static const warning = Color(0xFFD97706);
  static const danger = Color(0xFFDC2626);
  static const info = Color(0xFF0284C7);
}
