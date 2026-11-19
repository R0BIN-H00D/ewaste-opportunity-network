import 'package:material_ui/material_ui.dart';
import '../core/theme/app_colors.dart';

/// The app's logo: the robot-bin mascot on a light rounded tile, like the app icon on the phone. Used on the splash and
/// sign-in screens. If the picture cannot be loaded it falls back to the recycling mark, so a screen never shows a hole.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 56});

  final double size;

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        padding: EdgeInsets.all(size * 0.13),
        decoration: BoxDecoration(
          color: const Color(0xFFF7F7F7),
          borderRadius: BorderRadius.circular(size * 0.3),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.22), blurRadius: size * 0.4, offset: Offset(0, size * 0.14))],
        ),
        child: Image.asset(
          'assets/images/logo.png',
          fit: BoxFit.contain,
          filterQuality: FilterQuality.medium,
          errorBuilder: (_, __, ___) => Icon(Icons.recycling, size: size * 0.54, color: AppColors.primary),
        ),
      ),
    );
  }
}
