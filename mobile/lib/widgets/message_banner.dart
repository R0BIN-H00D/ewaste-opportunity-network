import 'package:material_ui/material_ui.dart';
import '../core/theme/app_colors.dart';

enum BannerTone { error, success, info, warning }

/// A short message with an icon and a coloured edge. Icon and words carry the meaning, never colour alone.
/// Announced to screen readers when it appears.
class MessageBanner extends StatelessWidget {
  const MessageBanner({super.key, required this.message, this.tone = BannerTone.info, this.action});

  final String message;
  final BannerTone tone;

  /// An optional button at the end, for example "Resend".
  final Widget? action;

  Color get _color {
    switch (tone) {
      case BannerTone.error:
        return AppColors.danger;
      case BannerTone.success:
        return AppColors.success;
      case BannerTone.warning:
        return AppColors.warning;
      case BannerTone.info:
        return AppColors.info;
    }
  }

  IconData get _icon {
    switch (tone) {
      case BannerTone.error:
        return Icons.error_outline;
      case BannerTone.success:
        return Icons.check_circle_outline;
      case BannerTone.warning:
        return Icons.warning_amber_rounded;
      case BannerTone.info:
        return Icons.info_outline;
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = _color;
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(12),
          border: Border(left: BorderSide(color: color, width: 4)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(_icon, color: color, size: 20),
            const SizedBox(width: 10),
            Expanded(child: Text(message, style: Theme.of(context).textTheme.bodyLarge?.copyWith(fontSize: 14, height: 1.4))),
            if (action != null) ...[const SizedBox(width: 8), action!],
          ],
        ),
      ),
    );
  }
}
