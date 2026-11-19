import 'package:material_ui/material_ui.dart';
import '../../core/theme/app_colors.dart';
import '../../models/recycling.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_container.dart';

/// "4.5 (12 reviews)" or "No reviews yet".
String centerRatingText(RecyclingCenter c) => c.hasRating ? '${c.ratingAvg.toStringAsFixed(1)} (${c.ratingCount} ${c.ratingCount == 1 ? 'review' : 'reviews'})' : 'No reviews yet';

/// "Laptops, Phones and 2 more", or a note when the centre has not said.
String acceptedText(RecyclingCenter c, {int show = 3}) {
  final names = c.acceptedCategories.map((x) => x.name).where((n) => n.isNotEmpty).toList();
  if (names.isEmpty) return 'Categories not listed';
  if (names.length <= show) return names.join(', ');
  return '${names.take(show).join(', ')} and ${names.length - show} more';
}

/// One recycling centre in the directory: name, place, what it takes and how it is rated.
class CenterCard extends StatelessWidget {
  const CenterCard({super.key, required this.center, required this.onTap});

  final RecyclingCenter center;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final c = center;
    return Semantics(
      button: true,
      label: '${c.name}${c.city == null ? '' : ', ${c.city}'}. Accepts ${acceptedText(c)}. ${centerRatingText(c)}.',
      excludeSemantics: true,
      child: GlassContainer(
        padding: EdgeInsets.zero,
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(24),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.recycling_outlined, color: theme.colorScheme.primary, size: 32),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(c.name, style: theme.textTheme.titleLarge?.copyWith(fontSize: 16), maxLines: 2, overflow: TextOverflow.ellipsis),
                        if (c.city != null && c.city!.trim().isNotEmpty) Text(c.city!, style: theme.textTheme.bodyMedium?.copyWith(fontSize: 13)),
                        const SizedBox(height: 6),
                        Text('Accepts: ${acceptedText(c)}', style: theme.textTheme.bodyMedium?.copyWith(fontSize: 13)),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            Icon(Icons.star_rounded, size: 16, color: c.hasRating ? AppColors.adapt(context, AppColors.star) : theme.disabledColor),
                            const SizedBox(width: 4),
                            Expanded(child: Text(centerRatingText(c), style: theme.textTheme.bodyMedium?.copyWith(fontSize: 13))),
                          ],
                        ),
                        if (c.authorized) ...[const SizedBox(height: 6), const StatusBadge('Authorised', tone: BadgeTone.green)],
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
