import 'package:material_ui/material_ui.dart';

/// A heading above a group of tiles or rows, with an optional line of help under it.
class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key, this.subtitle});

  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(header: true, child: Text(title, style: theme.textTheme.titleLarge)),
          if (subtitle != null) ...[
            const SizedBox(height: 2),
            Text(subtitle!, style: theme.textTheme.bodyMedium),
          ],
        ],
      ),
    );
  }
}
