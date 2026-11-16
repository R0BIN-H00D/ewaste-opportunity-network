import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../models/listing.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/listing_photo.dart';

BadgeTone conditionTone(String condition) => condition == 'fully_working' ? BadgeTone.green : BadgeTone.amber;

/// One listing in a list: photo, title, what it is for, condition, price and area.
class ListingCard extends StatelessWidget {
  const ListingCard({super.key, required this.listing, required this.onTap});

  final Listing listing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final place = listing.place;
    return Semantics(
      button: true,
      label: '${listing.title}. ${labelOf(services, listing.preferredService)}. ${labelOf(conditions, listing.condition)}. ${formatPrice(listing.expectedPrice)}.',
      excludeSemantics: true,
      child: GlassContainer(
        padding: EdgeInsets.zero,
        child: Material(
          type: MaterialType.transparency, // the glass paints a background, so touch feedback needs its own Material
          child: InkWell(
            borderRadius: BorderRadius.circular(24),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(16),
                    child: SizedBox(
                      width: 96,
                      height: 96,
                      child: ListingPhotoView(photo: listing.photos.isEmpty ? null : listing.photos.first),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(listing.title, style: theme.textTheme.titleLarge?.copyWith(fontSize: 16), maxLines: 2, overflow: TextOverflow.ellipsis),
                        if (listing.subtitle.isNotEmpty)
                          Text(listing.subtitle, style: theme.textTheme.bodyMedium?.copyWith(fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 6),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            StatusBadge(labelOf(services, listing.preferredService), tone: BadgeTone.blue),
                            StatusBadge(labelOf(conditions, listing.condition), tone: conditionTone(listing.condition)),
                            if (!listing.isLive) StatusBadge(listingStatusLabels[listing.status] ?? listing.status),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(formatPrice(listing.expectedPrice), style: theme.textTheme.titleLarge?.copyWith(fontSize: 17, color: theme.colorScheme.primary)),
                        if (place.isNotEmpty)
                          Row(
                            children: [
                              Icon(Icons.place_outlined, size: 14, color: theme.textTheme.bodyMedium?.color),
                              const SizedBox(width: 2),
                              Expanded(child: Text(place, style: theme.textTheme.bodyMedium?.copyWith(fontSize: 12), maxLines: 1, overflow: TextOverflow.ellipsis)),
                            ],
                          ),
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
