import 'dart:ui';
import 'package:material_ui/material_ui.dart';
import '../core/theme/glass_theme.dart';

/// The only glass primitive: a "liquid glass" panel. It blurs and tints what is behind it, catches the light along a thin
/// bright edge, and throws a soft shadow outside itself (see [GlassTheme]). Used for every card, the bottom bar and the
/// banners of the app.
///
/// RepaintBoundary keeps the blur from being repainted with unrelated content. Reduced-motion users get the panel without
/// the blur (a lighter effect for the phone), which still reads as glass because of the tint and the edge.
class GlassContainer extends StatelessWidget {
  const GlassContainer({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(20),
    this.radius = 28,
    this.blur,
    this.color,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final double? blur;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final glass = Theme.of(context).extension<GlassTheme>() ?? GlassTheme.light;
    final reduce = MediaQuery.maybeOf(context)?.disableAnimations ?? false; // proxy: accessibility-minded users get lighter effects
    final sigma = reduce ? 0.0 : (blur ?? glass.blur);
    final shape = BorderRadius.circular(radius);

    final pane = CustomPaint(
      foregroundPainter: _RimPainter(radius: radius, glass: glass),
      child: Container(
        padding: padding,
        decoration: BoxDecoration(
          borderRadius: shape,
          color: color,
          gradient: color == null
              ? LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: glass.fill, stops: const [0, 0.5, 1])
              : null,
        ),
        child: child,
      ),
    );

    return RepaintBoundary(
      child: CustomPaint(
        painter: _ShadowPainter(radius: radius, color: glass.shadowColor, blur: glass.shadowBlur, dy: glass.shadowDy),
        child: ClipRRect(
          borderRadius: shape,
          child: sigma > 0 ? BackdropFilter(filter: ImageFilter.blur(sigmaX: sigma, sigmaY: sigma), child: pane) : pane,
        ),
      ),
    );
  }
}

/// A soft shadow that falls only outside the panel: under a see-through pane a normal shadow would show through and dirty it.
class _ShadowPainter extends CustomPainter {
  const _ShadowPainter({required this.radius, required this.color, required this.blur, required this.dy});

  final double radius;
  final Color color;
  final double blur;
  final double dy;

  @override
  void paint(Canvas canvas, Size size) {
    final box = Offset.zero & size;
    final pane = RRect.fromRectAndRadius(box, Radius.circular(radius));
    final reach = blur * 2 + dy.abs() + 8;
    final outside = Path.combine(PathOperation.difference, Path()..addRect(box.inflate(reach)), Path()..addRRect(pane));
    canvas.save();
    canvas.clipPath(outside);
    canvas.drawRRect(pane.shift(Offset(0, dy)), Paint()..color = color..maskFilter = MaskFilter.blur(BlurStyle.normal, blur / 2));
    canvas.restore();
  }

  @override
  bool shouldRepaint(_ShadowPainter old) => old.radius != radius || old.color != color || old.blur != blur || old.dy != dy;
}

/// The glass edge: a hairline outside, a soft glow just inside, a bright rim that flares at two corners and fades between
/// them, and a fine line under the top edge. This thick luminous edge is what makes the pane look like glass.
class _RimPainter extends CustomPainter {
  const _RimPainter({required this.radius, required this.glass});

  final double radius;
  final GlassTheme glass;

  RRect _inset(Rect box, double by) => RRect.fromRectAndRadius(box.deflate(by), Radius.circular((radius - by).clamp(0, radius).toDouble()));

  @override
  void paint(Canvas canvas, Size size) {
    final box = Offset.zero & size;
    canvas.drawRRect(_inset(box, 0.4), Paint()..style = PaintingStyle.stroke..strokeWidth = 0.8..color = glass.edge);
    // The inner shade and glow, kept inside the pane. The shade gives it thickness at the bottom-right; the glow is the light
    // coming in at the top-left.
    canvas.save();
    canvas.clipRRect(RRect.fromRectAndRadius(box, Radius.circular(radius)));
    if (glass.innerShade.a > 0) {
      canvas.drawRRect(
        _inset(box, 3),
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 8
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4)
          ..shader = LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [glass.innerShade.withValues(alpha: 0), glass.innerShade.withValues(alpha: 0), glass.innerShade], stops: const [0, 0.5, 1]).createShader(box),
      );
    }
    canvas.drawRRect(
      _inset(box, 3),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 7
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3.5)
        ..shader = LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [glass.glow, glass.glow.withValues(alpha: 0), glass.glow.withValues(alpha: glass.glow.a * 0.7)], stops: const [0, 0.5, 1]).createShader(box),
    );
    canvas.restore();
    canvas.drawRRect(
      _inset(box, 1.0),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6
        ..shader = LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: glass.rim, stops: const [0, 0.5, 1]).createShader(box),
    );
    canvas.drawRRect(
      _inset(box, 2.4),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.0
        ..shader = LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [glass.highlight, const Color(0x00FFFFFF)], stops: const [0, 0.45]).createShader(box),
    );
  }

  @override
  bool shouldRepaint(_RimPainter old) => old.radius != radius || old.glass != glass;
}
