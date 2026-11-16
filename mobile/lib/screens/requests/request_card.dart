import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../models/service_request.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/listing_photo.dart';

/// Colour for a status badge: amber when the owner has to act, green when done, red when it ended without a repair.
BadgeTone requestTone(String status) {
  switch (status) {
    case 'customer_approval_pending':
    case 'quotation_submitted':
      return BadgeTone.amber;
    case 'service_completed':
      return BadgeTone.green;
    case 'rejected':
    case 'cancelled':
      return BadgeTone.red;
    default:
      return BadgeTone.blue;
  }
}

/// One request in the list: the device, who has it, and where it stands.
class RequestCard extends StatelessWidget {
  const RequestCard({super.key, required this.request, required this.onTap});

  final ServiceRequest request;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final r = request;
    // The technician sees who asked; the owner sees who is doing the work (or that the request is still open).
    final asTechnician = r.isTechnicianView;
    final who = asTechnician ? (r.customerName ?? 'Customer') : (r.technicianName ?? 'Open request');
    final status = requestStatusLabel(r.status, technician: asTechnician);
    return Semantics(
      button: true,
      label: '${r.deviceTitle}. $status. $who.',
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
                  ClipRRect(borderRadius: BorderRadius.circular(16), child: SizedBox(width: 72, height: 72, child: ListingPhotoView(photo: r.devicePhoto))),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(r.deviceTitle, style: theme.textTheme.titleLarge?.copyWith(fontSize: 16), maxLines: 1, overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            Icon(asTechnician ? Icons.person_outline : (r.technicianName != null ? Icons.handyman_outlined : Icons.campaign_outlined), size: 14, color: theme.textTheme.bodyMedium?.color),
                            const SizedBox(width: 4),
                            Expanded(child: Text(who, style: theme.textTheme.bodyMedium?.copyWith(fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis)),
                          ],
                        ),
                        const SizedBox(height: 6),
                        StatusBadge(status, tone: requestTone(r.status)),
                        if (r.updatedAt != null) ...[
                          const SizedBox(height: 4),
                          Text('Updated ${formatDate(r.updatedAt)}', style: theme.textTheme.bodyMedium?.copyWith(fontSize: 12)),
                        ],
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
