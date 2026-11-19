import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/theme/app_colors.dart';
import '../../models/recycling.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_container.dart';

/// Amber when the viewer has to act, green when done, red when it ended without recycling, blue otherwise.
BadgeTone recyclingTone(RecyclingRequest r) {
  switch (r.status) {
    case 'completed':
      return BadgeTone.green;
    case 'rejected':
    case 'cancelled':
      return BadgeTone.red;
    case 'requested':
      return r.isCenterView ? BadgeTone.amber : BadgeTone.blue;
    default:
      return BadgeTone.blue;
  }
}

/// One recycling request in the list: who it is with, how many devices, and where it stands.
class RecyclingCard extends StatelessWidget {
  const RecyclingCard({super.key, required this.request, required this.onTap});

  final RecyclingRequest request;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final r = request;
    final who = r.isCenterView ? (r.requesterName ?? 'Sender') : (r.centerName ?? 'Recycling centre');
    final status = recyclingStatusLabel(r.status, center: r.isCenterView);
    final what = '${r.deviceCount} ${r.deviceCount == 1 ? 'device' : 'devices'}${r.categoryNames.isEmpty ? '' : ' · ${r.categoryNames}'}';
    return Semantics(
      button: true,
      label: '${r.refNo}. $who. $what. $status.',
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
                  Icon(Icons.recycling_outlined, color: theme.colorScheme.primary, size: 30),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(who, style: theme.textTheme.titleLarge?.copyWith(fontSize: 16), maxLines: 1, overflow: TextOverflow.ellipsis),
                        Text(what, style: theme.textTheme.bodyMedium?.copyWith(fontSize: 13), maxLines: 2, overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 6),
                        StatusBadge(status, tone: recyclingTone(r)),
                        const SizedBox(height: 4),
                        Text('${r.refNo}${r.updatedAt == null ? '' : ' · Updated ${formatDate(r.updatedAt)}'}',
                            style: theme.textTheme.bodyMedium?.copyWith(fontSize: 12)),
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

/// Collection queue card for a recycling centre. The list shows the public pickup area only.
class CentreRecyclingCard extends StatelessWidget {
  const CentreRecyclingCard({super.key, required this.request, required this.onTap});

  final RecyclingRequest request;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final r = request;
    final tone = recyclingTone(r);
    final color = AppColors.adapt(
        context,
        switch (tone) {
          BadgeTone.amber => AppColors.warning,
          BadgeTone.green => AppColors.success,
          BadgeTone.red => AppColors.danger,
          _ => AppColors.info,
        });
    final devices = '${r.deviceCount} ${r.deviceCount == 1 ? 'device' : 'devices'}';
    final updated = r.updatedAt ?? r.createdAt;
    return GlassContainer(
      padding: EdgeInsets.zero,
      radius: 20,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(20),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              ExcludeSemantics(
                child: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(color: color.withValues(alpha: 0.13), borderRadius: BorderRadius.circular(12)),
                  child: Icon(Icons.inventory_2_outlined, size: 21, color: color),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Wrap(spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                    if (r.refNo.isNotEmpty) Text(r.refNo, style: theme.textTheme.labelMedium),
                    StatusBadge(recyclingStatusLabel(r.status, center: true), tone: tone),
                  ]),
                  const SizedBox(height: 6),
                  Text(r.requesterName ?? 'Sender', style: theme.textTheme.titleMedium),
                  Text(
                    [devices, if (r.categoryNames.isNotEmpty) r.categoryNames].join(' · '),
                    style: theme.textTheme.bodyMedium,
                  ),
                  if ((r.pickupArea?.isNotEmpty ?? false) || updated != null) ...[
                    const SizedBox(height: 8),
                    Wrap(spacing: 12, runSpacing: 4, children: [
                      if (r.pickupArea case final String area when area.isNotEmpty) Text(area, style: theme.textTheme.bodySmall),
                      if (updated != null)
                        Text('${r.updatedAt == null ? 'Received' : 'Updated'} ${formatDate(updated)}', style: theme.textTheme.bodySmall),
                    ]),
                  ],
                ]),
              ),
              const SizedBox(width: 6),
              ExcludeSemantics(child: Icon(Icons.chevron_right_rounded, color: theme.colorScheme.onSurfaceVariant)),
            ]),
          ),
        ),
      ),
    );
  }
}
