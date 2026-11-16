import 'package:material_ui/material_ui.dart';
import '../core/theme/app_colors.dart';

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
      child: child,
    );
  }
}
