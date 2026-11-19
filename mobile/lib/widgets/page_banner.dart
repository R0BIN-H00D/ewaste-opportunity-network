import 'package:material_ui/material_ui.dart';
import '../core/theme/app_colors.dart';

/// A compact brand banner at the top of a list screen: an icon, a heading and one line saying what the screen is for.
class PageBanner extends StatelessWidget {
  const PageBanner({super.key, required this.icon, required this.title, required this.subtitle});

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Semantics(
      container: true,
      label: '$title. $subtitle',
      excludeSemantics: true,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: DecoratedBox(
          decoration: const BoxDecoration(
            gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: AppColors.heroGradient),
          ),
          child: Stack(
            children: [
              Positioned(
                right: -30,
                top: -40,
                child: Container(width: 130, height: 130, decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: 0.07))),
              ),
              Padding(
                padding: const EdgeInsets.all(18),
                child: Row(
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(16)),
                      child: Icon(icon, color: Colors.white, size: 26),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(title, style: theme.textTheme.titleLarge?.copyWith(color: Colors.white)),
                          const SizedBox(height: 2),
                          Text(subtitle, style: theme.textTheme.bodySmall?.copyWith(color: Colors.white.withValues(alpha: 0.82))),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
