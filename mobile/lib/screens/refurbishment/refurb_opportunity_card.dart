import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../models/refurbishment.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/listing_photo.dart';
import '../devices/listing_card.dart' show conditionTone;

/// One device in the refurbisher's feed: photo, name, condition, public area, and whether an offer is already sent.
class RefurbOpportunityCard extends StatelessWidget {
  const RefurbOpportunityCard({super.key, required this.opportunity, required this.onTap});

  final RefurbOpportunity opportunity;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final d = opportunity.device;
    return Semantics(
      button: true,
      label: '${d.title}. ${labelOf(conditions, d.condition)}. ${d.place}.${opportunity.hasOffered ? ' You already made an offer.' : ''}',
      excludeSemantics: true,
      child: GlassContainer(
        padding: EdgeInsets.zero,
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(24),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ClipRRect(borderRadius: BorderRadius.circular(16), child: SizedBox(width: 88, height: 88, child: ListingPhotoView(photo: d.photos.isEmpty ? null : d.photos.first))),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(d.title, style: theme.textTheme.titleLarge?.copyWith(fontSize: 16), maxLines: 2, overflow: TextOverflow.ellipsis),
                        if (d.subtitle.isNotEmpty) Text(d.subtitle, style: theme.textTheme.bodyMedium?.copyWith(fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 6),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            StatusBadge(labelOf(conditions, d.condition), tone: conditionTone(d.condition)),
                            if (opportunity.hasOffered) const StatusBadge('Offer sent', tone: BadgeTone.blue),
                          ],
                        ),
                        if (d.place.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(d.place, style: theme.textTheme.bodyMedium?.copyWith(fontSize: 12))),
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
