import 'package:material_ui/material_ui.dart';
import '../core/theme/app_colors.dart';

/// The widest the content of a screen grows. On a tablet, or a phone turned sideways, the page stays this wide and
/// centred while the gradient still fills the whole screen, so lines of text and forms stay comfortable to read.
const double maxContentWidth = 720;

/// The soft green gradient that sits behind every glass surface, in light and dark.
class AppBackground extends StatelessWidget {
  const AppBackground({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: dark ? AppColors.gradientDark : AppColors.gradientLight,
        ),
      ),
      // Side padding rather than a Center or Align, which would hand the child loose height and break lists and Expanded.
      child: LayoutBuilder(
        builder: (context, constraints) {
          final side = constraints.maxWidth > maxContentWidth ? (constraints.maxWidth - maxContentWidth) / 2 : 0.0;
          return Padding(padding: EdgeInsets.symmetric(horizontal: side), child: child);
        },
      ),
    );
  }
}
