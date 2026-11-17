/// A learning-centre guide. The list carries no body; one article does.
class Article {
  const Article({required this.slug, required this.title, this.topic = '', this.summary = '', this.body = '', this.readMinutes = 1, this.featured = false, this.nextSlug, this.nextTitle});

  final String slug;
  final String title;
  final String topic;
  final String summary;

  /// Markdown, only on a single article.
  final String body;
  final int readMinutes;
  final bool featured;
  final String? nextSlug;
  final String? nextTitle;

  factory Article.fromJson(Map<String, dynamic> json) {
    final next = json['next'];
    return Article(
      slug: json['slug'] as String? ?? '',
      title: json['title'] as String? ?? '',
      topic: json['topic'] as String? ?? '',
      summary: json['summary'] as String? ?? '',
      body: json['body'] as String? ?? '',
      readMinutes: (json['readMinutes'] as num?)?.toInt() ?? 1,
      featured: json['featured'] == true,
      nextSlug: next is Map ? next['slug'] as String? : null,
      nextTitle: next is Map ? next['title'] as String? : null,
    );
  }
}

/// One block of an article body, after reading the Markdown.
class MdBlock {
  const MdBlock(this.type, {this.text = '', this.items = const []});

  /// `h2`, `h3`, `p`, `ul` or `ol`.
  final String type;
  final String text;
  final List<String> items;
}

/// Reads the small Markdown subset the server's articles use: headings, bullet and numbered lists, paragraphs.
/// Mirrors `parseMarkdown` on the web. Inline marks are handled when a block is drawn.
List<MdBlock> parseMarkdown(String source) {
  final blocks = <MdBlock>[];
  final para = <String>[];
  String? listType;
  var items = <String>[];
  void flushPara() {
    if (para.isNotEmpty) {
      blocks.add(MdBlock('p', text: para.join(' ')));
      para.clear();
    }
  }

  void flushList() {
    if (listType != null) {
      blocks.add(MdBlock(listType!, items: items));
      listType = null;
      items = <String>[];
    }
  }

  final heading = RegExp(r'^(#{1,3})\s+(.+)$');
  final bullet = RegExp(r'^\s*[-*]\s+(.+)$');
  final numbered = RegExp(r'^\s*\d+[.)]\s+(.+)$');
  for (final raw in source.replaceAll(RegExp(r'\r\n?'), '\n').split('\n')) {
    final line = raw.trimRight();
    if (line.trim().isEmpty) {
      flushPara();
      flushList();
      continue;
    }
    final h = heading.firstMatch(line);
    if (h != null) {
      flushPara();
      flushList();
      blocks.add(MdBlock(h.group(1)!.length == 3 ? 'h3' : 'h2', text: h.group(2)!.trim()));
      continue;
    }
    final b = bullet.firstMatch(line);
    final n = numbered.firstMatch(line);
    if (b != null || n != null) {
      flushPara();
      final type = b != null ? 'ul' : 'ol';
      if (listType != null && listType != type) flushList();
      listType ??= type;
      items.add((b ?? n)!.group(1)!.trim());
      continue;
    }
    flushList();
    para.add(line.trim());
  }
  flushPara();
  flushList();
  return blocks;
}