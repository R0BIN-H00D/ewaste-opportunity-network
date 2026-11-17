import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/article.dart';
import 'package:ewaste_opportunity/providers/article_providers.dart';
import 'package:ewaste_opportunity/providers/auth_controller.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/routes/route_paths.dart';
import 'package:ewaste_opportunity/screens/learn/learn_screens.dart';
import 'package:ewaste_opportunity/screens/learn/markdown_view.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../fakes.dart';
import '../helpers.dart';

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> _pump(WidgetTester tester, FakeArticleRepository repo, {String start = Routes.learn, double scale = 1}) async {
  tester.view.physicalSize = const Size(380, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final router = GoRouter(initialLocation: start, routes: [
    GoRoute(path: Routes.learn, builder: (_, __) => const LearnPage()),
    GoRoute(path: Routes.articlePattern, builder: (_, s) => ArticleScreen(slug: s.pathParameters['slug']!)),
  ]);
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository(loginResult: sampleMe())),
        articleRepositoryProvider.overrideWithValue(repo),
      ],
      child: MaterialApp.router(
        theme: AppTheme.light(),
        routerConfig: router,
        builder: (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)), child: child!),
      ),
    ),
  );
  final container = ProviderScope.containerOf(tester.element(find.byType(MaterialApp)));
  await container.read(authControllerProvider.notifier).signIn(email: 'asha@example.com', password: 'x');
  await _settle(tester);
}

void main() {
  group('reading Markdown', () {
    test('reads headings, lists and paragraphs, joining wrapped lines', () {
      final blocks = parseMarkdown('# Big\n\nFirst line\nsecond line\n\n## Small\n\n- a\n- b\n\n1. one\n2) two\n\n### Tiny\n');
      expect([for (final b in blocks) b.type], ['h2', 'p', 'h2', 'ul', 'ol', 'h3']);
      expect(blocks[1].text, 'First line second line');
      expect(blocks[3].items, ['a', 'b']);
      expect(blocks[4].items, ['one', 'two']);
      expect(parseMarkdown(''), isEmpty);
      expect(parseMarkdown('- a\r\n- b').single.items, ['a', 'b']);
    });

    test('switching list kind starts a new list', () {
      final blocks = parseMarkdown('- a\n1. b');
      expect([for (final b in blocks) b.type], ['ul', 'ol']);
    });

    test('inline marks become styled pieces, and an unsafe link keeps only its words', () {
      final spans = MarkdownView.spans('Use **care**, *always*, `reset`, [law](https://example.org) and [bad](javascript:alert(1)).', const TextStyle());
      final plain = spans.map((s) => (s as TextSpan).text).join();
      expect(plain, 'Use care, always, reset, law (https://example.org) and bad).'); // the stray bracket is the text after the address, as on the web
      expect(plain, isNot(contains('javascript')));
      expect((spans[1] as TextSpan).style?.fontWeight, FontWeight.w700);
      expect((spans[3] as TextSpan).style?.fontStyle, FontStyle.italic);
    });

    test('markup is kept as text', () {
      final spans = MarkdownView.spans('Read <script>alert(1)</script> now', const TextStyle());
      expect(spans.map((s) => (s as TextSpan).text).join(), 'Read <script>alert(1)</script> now');
    });
  });

  group('the guides list', () {
    testWidgets('shows each guide with its summary and reading time, and opens it', (tester) async {
      await _pump(tester, FakeArticleRepository());
      expect(find.text('Safe disposal'), findsOneWidget);
      expect(find.text('How to get rid of it.'), findsOneWidget);
      expect(find.text('2 min read'), findsOneWidget);
      await tester.tap(find.text('Safe disposal'));
      await _settle(tester);
      expect(find.text('What you can do'), findsOneWidget);
    });

    testWidgets('says so when there are none', (tester) async {
      await _pump(tester, FakeArticleRepository(articles: const []));
      expect(find.text('No guides yet'), findsOneWidget);
    });

    testWidgets('says why it failed, and loads on retry', (tester) async {
      final repo = FakeArticleRepository()..error = const ApiException('Cannot reach the server', failure: ApiFailure.network);
      await _pump(tester, repo);
      expect(find.textContaining('Cannot reach the server'), findsWidgets);
      repo.error = null;
      await tester.tap(find.text('Try again').first);
      await _settle(tester);
      expect(find.text('Safe disposal'), findsOneWidget);
    });
  });

  group('one guide', () {
    testWidgets('draws the text, the lists and the next guide', (tester) async {
      final repo = FakeArticleRepository(full: {
        'safe-disposal': articleJson(next: {'slug': 'reuse', 'title': 'Reuse and donation'}),
        'reuse': articleJson(slug: 'reuse', title: 'Reuse and donation', body: 'Give it a second life.'),
      });
      await _pump(tester, repo, start: Routes.article('safe-disposal'));
      expect(find.text('Safe disposal'), findsWidgets);
      expect(find.text('One'), findsOneWidget);
      expect(find.text('List the device.'), findsOneWidget);
      await tester.tap(find.text('Next: Reuse and donation'));
      await _settle(tester);
      expect(repo.asked, ['safe-disposal', 'reuse']);
      expect(find.text('Give it a second life.'), findsOneWidget);
    });

    testWidgets('says "not found" for a guide that was taken down', (tester) async {
      await _pump(tester, FakeArticleRepository(), start: Routes.article('gone'));
      expect(find.text('Guide not found'), findsOneWidget);
    });

    testWidgets('offers a retry for other failures, not "not found"', (tester) async {
      final repo = FakeArticleRepository()..error = const ApiException('Cannot reach the server', failure: ApiFailure.network);
      await _pump(tester, repo, start: Routes.article('safe-disposal'));
      expect(find.textContaining('Cannot reach the server'), findsWidgets);
      expect(find.text('Guide not found'), findsNothing);
    });

    testWidgets('a guide fits at the largest text size', (tester) async {
      await _pump(tester, FakeArticleRepository(), start: Routes.article('safe-disposal'), scale: 2);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the list fits at the largest text size', (tester) async {
      await _pump(tester, FakeArticleRepository(), scale: 2);
      expect(tester.takeException(), isNull);
    });
  });

  test('reads a guide from the server answer', () {
    final a = Article.fromJson(articleJson(next: {'slug': 'x', 'title': 'Next one'}));
    expect(a.slug, 'safe-disposal');
    expect(a.readMinutes, 2);
    expect(a.nextTitle, 'Next one');
    expect(Article.fromJson({}).title, '');
    expect(Article.fromJson({}).readMinutes, 1);
  });
}