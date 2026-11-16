import 'package:material_ui/material_ui.dart';
import 'app_colors.dart';

/// Theme extension carrying glassmorphism parameters (light/dark).
@immutable
class GlassTheme extends ThemeExtension<GlassTheme> {
  const GlassTheme({
    required this.background,
    required this.border,
    required this.blur,
    required this.shadow,
  });

  final Color background;
  final Color border;
  final double blur;
  final List<BoxShadow> shadow;

  static const light = GlassTheme(
    background: AppColors.glassLight,
    border: AppColors.glassBorderLight,
    blur: 16,
    shadow: [BoxShadow(color: Color(0x1A14532D), blurRadius: 32, offset: Offset(0, 8))],
  );

  static const dark = GlassTheme(
    background: AppColors.glassDark,
    border: AppColors.glassBorderDark,
    blur: 16,
    shadow: [BoxShadow(color: Color(0x66000000), blurRadius: 32, offset: Offset(0, 8))],
  );

  @override
  GlassTheme copyWith({Color? background, Color? border, double? blur, List<BoxShadow>? shadow}) =>
      GlassTheme(
        background: background ?? this.background,
        border: border ?? this.border,
        blur: blur ?? this.blur,
        shadow: shadow ?? this.shadow,
      );

  @override
  GlassTheme lerp(ThemeExtension<GlassTheme>? other, double t) {
    if (other is! GlassTheme) return this;
    return GlassTheme(
      background: Color.lerp(background, other.background, t)!,
      border: Color.lerp(border, other.border, t)!,
      blur: blur + (other.blur - blur) * t,
      shadow: t < 0.5 ? shadow : other.shadow,
    );
  }
}
