import 'package:material_ui/material_ui.dart';
import '../../models/article.dart';
import '../../widgets/glass_container.dart';

/// Draws an article body. It builds text itself and never interprets HTML, so markup in an article shows as text.
/// Inline: **bold**, *italic*, `code` and [links](https://...). A link is shown as its words with the address after it, because
/// the app does not open web pages from inside an article.
class MarkdownView extends StatelessWidget {
  const MarkdownView({super.key, required this.source});

  final String source;

  static final _inline = RegExp(r'(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))');
  static final _link = RegExp(r'^\[([^\]]+)\]\(([^)\s]+)\)$');

  /// Turns one line of text into styled pieces. Public for tests.
  static List<InlineSpan> spans(String text, TextStyle base) {
    final out = <InlineSpan>[];
    var last = 0;
    for (final m in _inline.allMatches(text)) {
      if (m.start > last) out.add(TextSpan(text: text.substring(last, m.start)));
      final part = m.group(0)!;
      if (part.startsWith('**')) {
        out.add(TextSpan(text: part.substring(2, part.length - 2), style: const TextStyle(fontWeight: FontWeight.w700)));
      } else if (part.startsWith('`')) {
        out.add(TextSpan(text: part.substring(1, part.length - 1), style: const TextStyle(fontFamily: 'monospace')));
      } else if (part.startsWith('*')) {
        out.add(TextSpan(text: part.substring(1, part.length - 1), style: const TextStyle(fontStyle: FontStyle.italic)));
      } else {
        final l = _link.firstMatch(part)!;
        final href = l.group(2)!;
        final safe = RegExp(r'^(https?://|mailto:)', caseSensitive: false).hasMatch(href);
        out.add(TextSpan(text: l.group(1), style: safe ? const TextStyle(decoration: TextDecoration.underline) : null));
        if (safe) out.add(TextSpan(text: ' ($href)'));
      }
      last = m.end;
    }
    if (last < text.length) out.add(TextSpan(text: text.substring(last)));
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final body = theme.textTheme.bodyLarge ?? const TextStyle();
    Widget rich(String text, [TextStyle? style]) => Text.rich(TextSpan(style: style ?? body, children: spans(text, style ?? body)));
    final children = <Widget>[];
    for (final b in parseMarkdown(source)) {
      switch (b.type) {
        case 'h2':
          children.add(Semantics(header: true, child: Padding(padding: const EdgeInsets.only(top: 8), child: Text(b.text, style: theme.textTheme.titleLarge))));
        case 'h3':
          children.add(Semantics(header: true, child: Padding(padding: const EdgeInsets.only(top: 4), child: Text(b.text, style: theme.textTheme.titleMedium))));
        case 'ul':
          for (final item in b.items) {
            children.add(GlassContainer(padding: const EdgeInsets.all(14), child: SizedBox(width: double.infinity, child: rich(item))));
          }
        case 'ol':
          for (var i = 0; i < b.items.length; i++) {
            children.add(Row(crossAxisAlignment: CrossAxisAlignment.start, children: [SizedBox(width: 28, child: Text('${i + 1}.', style: body)), Expanded(child: rich(b.items[i]))]));
          }
        default:
          children.add(rich(b.text));
      }
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [for (var i = 0; i < children.length; i++) Padding(padding: EdgeInsets.only(top: i == 0 ? 0 : 12), child: children[i])],
    );
  }
}