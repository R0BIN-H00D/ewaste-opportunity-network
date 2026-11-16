import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../models/donation.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/listing_photo.dart';
import '../devices/listing_card.dart' show conditionTone;

/// Amber when the viewer has to act, green when done, red when cancelled, blue otherwise.
BadgeTone donationTone(Donation d) {
  switch (d.status) {
    case 'completed':
      return BadgeTone.green;
    case 'cancelled':
      return BadgeTone.red;
    case 'requested':
      return d.isDonorView ? BadgeTone.amber : BadgeTone.blue;
    case 'accepted':
      return d.isRecipientView || d.isDonorView ? BadgeTone.amber : BadgeTone.blue;
    default:
      return BadgeTone.blue;
  }
}

/// The status as this viewer should read it: someone who asked sees "Waiting for the donor", the donor sees how many are waiting.
String donationStatusText(Donation d) {
  if (d.isDonorView && d.status == 'requested' && d.pendingRequests > 0) return '${d.pendingRequests} ${d.pendingRequests == 1 ? 'request' : 'requests'} waiting';
  final asked = d.viewerRole == 'requester' || d.isRecipientView;
  return donationStatusLabel(d.status, recipient: asked);
}

/// One donation in a list: photo, device, condition, place and where it stands.
class DonationCard extends StatelessWidget {
  const DonationCard({super.key, required this.donation, required this.onTap});

  final Donation donation;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final d = donation;
    final status = donationStatusText(d);
    final extra = d.myRequest != null ? 'Your request: ${labelOf(const [('pending', 'waiting'), ('accepted', 'chosen'), ('rejected', 'not chosen'), ('withdrawn', 'withdrawn')], d.myRequest!.status)}' : null;
    return Semantics(
      button: true,
      label: '${d.device.title}. ${labelOf(conditions, d.device.condition)}. ${d.device.place}. $status.',
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
                  ClipRRect(borderRadius: BorderRadius.circular(16), child: SizedBox(width: 88, height: 88, child: ListingPhotoView(photo: d.device.photos.isEmpty ? null : d.device.photos.first))),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(d.device.title, style: theme.textTheme.titleLarge?.copyWith(fontSize: 16), maxLines: 2, overflow: TextOverflow.ellipsis),
                        if (d.device.subtitle.isNotEmpty) Text(d.device.subtitle, style: theme.textTheme.bodyMedium?.copyWith(fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 6),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            StatusBadge(labelOf(conditions, d.device.condition), tone: conditionTone(d.device.condition)),
                            StatusBadge(status, tone: donationTone(d)),
                          ],
                        ),
                        if (d.device.place.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(d.device.place, style: theme.textTheme.bodyMedium?.copyWith(fontSize: 12))),
                        if (extra != null) Text(extra, style: theme.textTheme.bodyMedium?.copyWith(fontSize: 12)),
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
