import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../models/learning.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_container.dart';

BadgeTone difficultyTone(String difficulty) => difficulty == 'beginner' ? BadgeTone.green : (difficulty == 'intermediate' ? BadgeTone.blue : BadgeTone.amber);

/// "3 places left", "Only 1 place left", "Full".
String seatsText(Opportunity o) {
  if (o.seatsLeft <= 0) return 'Full';
  return o.seatsLeft == 1 ? 'Only 1 place left' : '${o.seatsLeft} places left';
}

/// Amber when the student has an application to follow up, green once it is completed, blue otherwise.
BadgeTone applicationTone(String status) {
  switch (status) {
    case 'completed':
      return BadgeTone.green;
    case 'rejected':
    case 'withdrawn':
      return BadgeTone.red;
    case 'accepted':
    case 'in_progress':
      return BadgeTone.amber;
    default:
      return BadgeTone.blue;
  }
}

/// One task in the list: title, difficulty, area, deadline and how many places are left.
class OpportunityCard extends StatelessWidget {
  const OpportunityCard({super.key, required this.opportunity, required this.onTap});

  final Opportunity opportunity;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final o = opportunity;
    final detail = [if (o.categoryName != null) o.categoryName!, o.locationArea, if (o.deadline != null) 'Apply by ${formatDate(o.deadline)}'].where((p) => p.trim().isNotEmpty).join(' · ');
    return Semantics(
      button: true,
      label: '${o.title}. ${labelOf(difficulties, o.difficulty)}. $detail. ${seatsText(o)}.${o.myApplication == null ? '' : ' You applied.'}',
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
                  Icon(Icons.school_outlined, color: theme.colorScheme.primary, size: 30),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(o.title, style: theme.textTheme.titleLarge?.copyWith(fontSize: 16), maxLines: 2, overflow: TextOverflow.ellipsis),
                        Text(detail, style: theme.textTheme.bodyMedium?.copyWith(fontSize: 13), maxLines: 2, overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 6),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            StatusBadge(labelOf(difficulties, o.difficulty), tone: difficultyTone(o.difficulty)),
                            StatusBadge(seatsText(o), tone: o.seatsLeft > 0 ? BadgeTone.neutral : BadgeTone.red),
                            if (o.myApplication != null) StatusBadge(applicationStatusLabel(o.myApplication!.status), tone: applicationTone(o.myApplication!.status)),
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
