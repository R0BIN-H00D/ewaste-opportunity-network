import 'package:material_ui/material_ui.dart';
import '../core/condition_parts.dart';
import '../core/format.dart';
import 'glass_container.dart';

/// How many parts are shown before "Read more": working condition, battery, screen and scratches come first.
const aboutDeviceShown = 4;

/// "About this device" on a product page: how each part is doing, in plain words, with the seller's own remarks. The first few
/// parts are shown; "Read more" opens the rest and the remarks.
class AboutDeviceCard extends StatefulWidget {
  const AboutDeviceCard({super.key, required this.condition, required this.details, this.note});

  /// The disclosed grade of the product (`like_new`, `excellent`, `good` or `fair`).
  final String condition;
  final Map<String, String> details;
  final String? note;

  @override
  State<AboutDeviceCard> createState() => _AboutDeviceCardState();
}

class _AboutDeviceCardState extends State<AboutDeviceCard> {
  bool _open = false;

  static Color _dot(BuildContext context, PartTone tone) {
    final scheme = Theme.of(context).colorScheme;
    switch (tone) {
      case PartTone.good:
        return scheme.primary;
      case PartTone.warn:
        return const Color(0xFFB7791F);
      case PartTone.bad:
        return scheme.error;
    }
  }

  static String _toneWords(PartTone tone) {
    switch (tone) {
      case PartTone.good:
        return 'Good';
      case PartTone.warn:
        return 'Minor issue';
      case PartTone.bad:
        return 'Needs attention';
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final rows = aboutRows(widget.details);
    final note = (widget.note ?? '').trim();
    final shown = _open ? rows : rows.take(aboutDeviceShown).toList();
    final hasMore = rows.length > aboutDeviceShown || note.isNotEmpty;
    return GlassContainer(
      radius: 24,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(Icons.fact_check_outlined, size: 20, color: theme.colorScheme.primary),
            const SizedBox(width: 8),
            Expanded(child: Semantics(header: true, child: Text('About this device', style: theme.textTheme.titleMedium))),
          ]),
          const SizedBox(height: 8),
          Text('Overall condition: ${labelOf(productConditions, widget.condition)}', style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          if (rows.isEmpty)
            Text('The seller has not added the details of each part yet. You can ask the seller a question below.', style: theme.textTheme.bodyMedium)
          else
            for (final r in shown)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 7),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: Text(r.label, style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700))),
                    const SizedBox(width: 12),
                    Flexible(
                      child: Semantics(
                        label: '${r.answer}, ${_toneWords(r.tone)}',
                        excludeSemantics: true,
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Padding(
                              padding: const EdgeInsets.only(top: 6, right: 8),
                              child: Container(width: 10, height: 10, decoration: BoxDecoration(color: _dot(context, r.tone), shape: BoxShape.circle)),
                            ),
                            Flexible(child: Text(r.answer, textAlign: TextAlign.end, style: theme.textTheme.bodyLarge)),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
          if (_open && note.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('Other notes from the seller', style: theme.textTheme.titleSmall),
            const SizedBox(height: 4),
            Text(note, style: theme.textTheme.bodyLarge),
          ],
          if (hasMore) ...[
            const SizedBox(height: 6),
            TextButton(
              onPressed: () => setState(() => _open = !_open),
              child: Text(_open ? 'Show less' : 'Read more'),
            ),
          ],
        ],
      ),
    );
  }
}
