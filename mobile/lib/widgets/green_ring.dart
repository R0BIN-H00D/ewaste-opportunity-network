import 'package:material_ui/material_ui.dart';
import '../models/impact.dart';

/// The Green Score as a ring: how far through the current level, with the score in the middle. Read out in words for
/// screen readers, since a ring on its own says nothing.
class GreenRing extends StatelessWidget {
  const GreenRing({super.key, required this.score, required this.level, this.size = 72});

  final int score;
  final GreenLevel level;
  final double size;

  String get _words => level.isTop
      ? 'Green Score $score, level ${level.name}, the highest level'
      : 'Green Score $score, level ${level.name}, ${level.pointsToNext(score)} points to ${level.nextName}';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final big = size >= 100;
    return Semantics(
      label: _words,
      excludeSemantics: true,
      child: SizedBox(
        width: size,
        height: size,
        child: Stack(
          alignment: Alignment.center,
          children: [
            SizedBox.expand(
              child: CircularProgressIndicator(
                value: level.progress,
                strokeWidth: big ? 10 : 6,
                strokeCap: StrokeCap.round,
                backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.15),
                valueColor: AlwaysStoppedAnimation(theme.colorScheme.primary),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(8),
              child: FittedBox(
                child: Text('$score', style: (big ? theme.textTheme.displaySmall : theme.textTheme.titleLarge)?.copyWith(fontWeight: FontWeight.w800, color: theme.colorScheme.primary)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
