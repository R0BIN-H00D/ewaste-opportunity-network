import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../models/learning.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_container.dart';
import 'opportunity_card.dart';

/// One application in the list: the task, where it stands, and the hours once there are some.
class ApplicationCard extends StatelessWidget {
  const ApplicationCard({super.key, required this.application, required this.onTap});

  final Application application;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final a = application;
    final detail = [if (a.supervisorName != null) 'Supervisor ${a.supervisorName}', if (a.locationArea != null && a.locationArea!.isNotEmpty) a.locationArea!].join(' · ');
    final status = applicationStatusLabel(a.status);
    return Semantics(
      button: true,
      label: '${a.opportunityTitle}. $detail. $status.${a.hours > 0 ? ' ${formatHours(a.hours)} recorded.' : ''}',
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
                  Icon(Icons.assignment_turned_in_outlined, color: theme.colorScheme.primary, size: 30),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(a.opportunityTitle, style: theme.textTheme.titleLarge?.copyWith(fontSize: 16), maxLines: 2, overflow: TextOverflow.ellipsis),
                        if (detail.isNotEmpty) Text(detail, style: theme.textTheme.bodyMedium?.copyWith(fontSize: 13), maxLines: 2, overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 6),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            StatusBadge(status, tone: applicationTone(a.status)),
                            if (a.hours > 0) StatusBadge(formatHours(a.hours), tone: BadgeTone.neutral),
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
