import 'package:material_ui/material_ui.dart';
import '../core/theme/app_colors.dart';

/// A tappable filter chip. At least 44 dp high; the selected state is shown with a tick and a stronger border, not colour alone.
class AppChip extends StatelessWidget {
  const AppChip({super.key, required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      excludeSemantics: true,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: BorderRadius.circular(22),
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 44),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(
                color: selected ? scheme.primary.withValues(alpha: 0.16) : scheme.surface.withValues(alpha: 0.5),
                borderRadius: BorderRadius.circular(22),
                border: Border.all(color: selected ? scheme.primary : scheme.outline, width: selected ? 1.6 : 1),
              ),
              // Centre the label without letting the chip grow to the full width of a Wrap.
              child: Center(
                widthFactor: 1,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (selected) ...[Icon(Icons.check, size: 16, color: scheme.primary), const SizedBox(width: 6)],
                    Text(label, style: Theme.of(context).textTheme.labelSmall?.copyWith(fontSize: 13, color: selected ? scheme.primary : scheme.onSurface)),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

enum BadgeTone { neutral, green, amber, blue, red }

/// A small label such as "Repair" or "Minor damage". The words carry the meaning; colour only supports them.
class StatusBadge extends StatelessWidget {
  const StatusBadge(this.label, {super.key, this.tone = BadgeTone.neutral});

  final String label;
  final BadgeTone tone;

  Color _color(BuildContext context) {
    switch (tone) {
      case BadgeTone.green:
        return AppColors.success;
      case BadgeTone.amber:
        return AppColors.warning;
      case BadgeTone.blue:
        return AppColors.info;
      case BadgeTone.red:
        return AppColors.danger;
      case BadgeTone.neutral:
        return Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7);
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = AppColors.adapt(context, _color(context));
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.28)),
      ),
      child: Text(label, style: Theme.of(context).textTheme.labelSmall?.copyWith(color: color, fontSize: 12, fontWeight: FontWeight.w700)),
    );
  }
}
