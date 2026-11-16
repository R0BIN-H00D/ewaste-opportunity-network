import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../models/refurbishment.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/listing_photo.dart';

/// Amber when the viewer has to act, green when on sale, red when cancelled, blue otherwise.
BadgeTone refurbJobTone(RefurbJob j) {
  switch (j.status) {
    case 'listed':
      return BadgeTone.green;
    case 'cancelled':
      return BadgeTone.red;
    case 'offered':
      return j.isOwnerView ? BadgeTone.amber : BadgeTone.blue;
    case 'ready_to_list':
      return j.isRefurbisherView ? BadgeTone.amber : BadgeTone.blue;
    default:
      return j.actions.isNotEmpty ? BadgeTone.amber : BadgeTone.blue;
  }
}

String refurbJobStatusText(RefurbJob j) => refurbStatusLabel(j.status, owner: j.isOwnerView);

/// One refurbishment job in a list: photo, device, who is on the other side, the offer and where it stands.
class RefurbJobCard extends StatelessWidget {
  const RefurbJobCard({super.key, required this.job, required this.onTap});

  final RefurbJob job;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final j = job;
    final status = refurbJobStatusText(j);
    final other = j.otherSideName;
    final offer = j.offerAmount > 0 ? 'Offer ${formatPrice(j.offerAmount)}' : 'Free collection';
    return Semantics(
      button: true,
      label: '${j.device.title}. $status.${other == null ? '' : ' ${j.isRefurbisherView ? 'Owner' : 'Refurbisher'} $other.'} $offer.',
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
                  ClipRRect(borderRadius: BorderRadius.circular(16), child: SizedBox(width: 80, height: 80, child: ListingPhotoView(photo: j.device.photos.isEmpty ? null : j.device.photos.first))),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(j.device.title, style: theme.textTheme.titleLarge?.copyWith(fontSize: 16), maxLines: 2, overflow: TextOverflow.ellipsis),
                        if (other != null) Text('${j.isRefurbisherView ? 'Owner' : 'Refurbisher'}: $other', style: theme.textTheme.bodyMedium?.copyWith(fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 6),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [StatusBadge(status, tone: refurbJobTone(j)), StatusBadge(offer, tone: BadgeTone.neutral)],
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
