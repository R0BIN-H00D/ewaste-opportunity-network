import 'package:material_ui/material_ui.dart';
import '../core/theme/app_colors.dart';
import 'glass_container.dart';

class MenuSection extends StatelessWidget {
  const MenuSection({super.key, this.caption, required this.rows});

  final String? caption;
  final List<Widget> rows;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (caption case final label?)
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
            child: Semantics(
              header: true,
              child: Text(label.toUpperCase(), style: theme.textTheme.labelSmall?.copyWith(letterSpacing: 1.1, fontWeight: FontWeight.w800)),
            ),
          ),
        GlassContainer(
          padding: const EdgeInsets.symmetric(vertical: 6),
          radius: 22,
          child: Material(
            type: MaterialType.transparency,
            child: Column(
              children: [
                for (var i = 0; i < rows.length; i++) ...[
                  if (i > 0) Divider(height: 1, indent: 70, endIndent: 16, color: theme.colorScheme.outlineVariant),
                  rows[i],
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// A menu link with a coloured icon and an optional unread count.
class MenuRow extends StatelessWidget {
  const MenuRow({super.key, required this.icon, required this.accent, required this.title, required this.subtitle, required this.onTap, this.badge = 0, this.footer});

  final IconData icon;
  final Color accent;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final int badge;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = AppColors.adapt(context, this.accent);
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 60),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Row(
            children: [
              ExcludeSemantics(
                child: Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(color: accent.withValues(alpha: 0.13), borderRadius: BorderRadius.circular(14)),
                  child: Icon(icon, size: 22, color: accent),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: theme.textTheme.titleSmall),
                    const SizedBox(height: 1),
                    Text(subtitle, style: theme.textTheme.bodySmall, maxLines: 2, overflow: TextOverflow.ellipsis),
                    if (footer != null) ...[
                      const SizedBox(height: 6),
                      footer!,
                    ],
                  ],
                ),
              ),
              if (badge > 0)
                Semantics(
                  label: '$badge unread',
                  excludeSemantics: true,
                  child: Badge(label: Text(badge > 99 ? '99+' : '$badge'), backgroundColor: theme.colorScheme.primary, textColor: theme.colorScheme.onPrimary),
                ),
              const SizedBox(width: 4),
              Icon(Icons.chevron_right_rounded, color: theme.colorScheme.onSurface.withValues(alpha: 0.4)),
            ],
          ),
        ),
      ),
    );
  }
}
