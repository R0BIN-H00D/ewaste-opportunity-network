import 'package:material_ui/material_ui.dart';
import '../core/theme/app_colors.dart';

/// The widest the content of a screen grows. On a tablet, or a phone turned sideways, the page stays this wide and
/// centred while the gradient still fills the whole screen, so lines of text and forms stay comfortable to read.
const double maxContentWidth = 720;

/// The backdrop of every screen: the soft gradient, and large blurred colour shapes ("orbs") in it. The glass panels on top
/// blur and tint whatever is behind them, so the orbs are what make the glass look like glass. They sit still; as the page
/// scrolls, the cards slide over them and pick up their colours.
class AppBackground extends StatelessWidget {
  const AppBackground({super.key, required this.child, this.centerContent = true});

  final Widget child;
  final bool centerContent;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final orbs = dark ? AppColors.orbsDark : AppColors.orbsLight;
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: dark ? AppColors.gradientDark : AppColors.gradientLight,
        ),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxWidth;
          final height = constraints.maxHeight;
          final side = centerContent && width > maxContentWidth ? (width - maxContentWidth) / 2 : 0.0;
          return Stack(
            children: [
              for (final orb in orbs)
                Positioned(
                  left: orb.x * width - orb.size * width / 2,
                  top: orb.y * height - orb.size * width / 2,
                  width: orb.size * width,
                  height: orb.size * width,
                  // Decoration only: nothing to read, nothing to tap.
                  child: IgnorePointer(
                    child: ExcludeSemantics(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: RadialGradient(colors: [orb.color, orb.color.withValues(alpha: 0)]),
                        ),
                      ),
                    ),
                  ),
                ),
              // Side padding rather than a Center or Align, which would hand the child loose height and break lists and Expanded.
              Positioned.fill(child: Padding(padding: EdgeInsets.symmetric(horizontal: side), child: child)),
            ],
          );
        },
      ),
    );
  }
}
