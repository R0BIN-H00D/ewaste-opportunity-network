import 'dart:ui';
import 'package:material_ui/material_ui.dart';
import '../core/theme/glass_theme.dart';

/// The only glass primitive. Use for nav, hero stat cards, sheets — not for long scrolling lists.
/// RepaintBoundary isolates the blur so it isn't repainted with unrelated content.
class GlassContainer extends StatelessWidget {
  const GlassContainer({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(20),
    this.radius = 24,
    this.blur,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final double? blur;

  @override
  Widget build(BuildContext context) {
    final glass = Theme.of(context).extension<GlassTheme>() ?? GlassTheme.light;
    final reduce = MediaQuery.maybeOf(context)?.disableAnimations ?? false; // proxy: accessibility-minded users get lighter effects
    final sigma = reduce ? 0.0 : (blur ?? glass.blur);
    final radiusGeo = BorderRadius.circular(radius);

    final content = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: glass.background,
        borderRadius: radiusGeo,
        border: Border.all(color: glass.border),
        boxShadow: glass.shadow,
      ),
      child: child,
    );

    return RepaintBoundary(
      child: ClipRRect(
        borderRadius: radiusGeo,
        child: sigma > 0
            ? BackdropFilter(filter: ImageFilter.blur(sigmaX: sigma, sigmaY: sigma), child: content)
            : content,
      ),
    );
  }
}
