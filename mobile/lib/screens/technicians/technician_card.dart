import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../models/technician.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_container.dart';

BadgeTone availabilityTone(String status) => status == 'available' ? BadgeTone.green : (status == 'limited' ? BadgeTone.amber : BadgeTone.neutral);

/// "4.5 (12 reviews)" or "No reviews yet".
String ratingText(Technician t) {
  if (!t.hasRating) return 'No reviews yet';
  return '${t.ratingAvg.toStringAsFixed(1)} (${t.ratingCount} ${t.ratingCount == 1 ? 'review' : 'reviews'})';
}

/// A round badge with the technician's first letter (photos come later).
class TechnicianAvatar extends StatelessWidget {
  const TechnicianAvatar({super.key, required this.name, this.size = 52});

  final String name;
  final double size;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final letter = name.trim().isEmpty ? '?' : name.trim().characters.first.toUpperCase();
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(shape: BoxShape.circle, color: scheme.primary.withValues(alpha: 0.14)),
        child: Text(letter, style: Theme.of(context).textTheme.titleLarge?.copyWith(color: scheme.primary)),
      ),
    );
  }
}

/// One technician in the directory.
class TechnicianCard extends StatelessWidget {
  const TechnicianCard({super.key, required this.technician, required this.onTap});

  final Technician technician;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = technician;
    return Semantics(
      button: true,
      label: '${t.name}. ${labelOf(availabilities, t.availability)}. ${ratingText(t)}. ${t.completedJobs} jobs done. ${t.place}.',
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
                  TechnicianAvatar(name: t.name),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(t.name, style: theme.textTheme.titleLarge?.copyWith(fontSize: 16), maxLines: 1, overflow: TextOverflow.ellipsis),
                        if (t.headline != null && t.headline!.trim().isNotEmpty)
                          Text(t.headline!, style: theme.textTheme.bodyMedium?.copyWith(fontSize: 13), maxLines: 2, overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            Icon(Icons.star_rounded, size: 16, color: t.hasRating ? Colors.amber.shade700 : theme.disabledColor),
                            const SizedBox(width: 4),
                            Flexible(child: Text(ratingText(t), style: theme.textTheme.bodyMedium?.copyWith(fontSize: 13), overflow: TextOverflow.ellipsis)),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            StatusBadge(labelOf(availabilities, t.availability), tone: availabilityTone(t.availability)),
                            StatusBadge('${t.completedJobs} ${t.completedJobs == 1 ? 'job' : 'jobs'} done'),
                            if (t.distanceKm != null) StatusBadge('${t.distanceKm} km away', tone: BadgeTone.blue),
                          ],
                        ),
                        if (t.place.isNotEmpty) ...[
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              Icon(Icons.place_outlined, size: 14, color: theme.textTheme.bodyMedium?.color),
                              const SizedBox(width: 2),
                              Expanded(child: Text(t.place, style: theme.textTheme.bodyMedium?.copyWith(fontSize: 12), maxLines: 1, overflow: TextOverflow.ellipsis)),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
