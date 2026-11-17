import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/network/api_exception.dart';
import '../../models/article.dart';
import '../../providers/article_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/paged_list.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';
import 'markdown_view.dart';

/// The learning centre: short guides on e-waste, safe disposal, reuse, repair, recycling and protecting your data.
class LearnScreen extends ConsumerWidget {
  const LearnScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    return PagedList<Article>(
      provider: articlesProvider,
      header: Text('Short, practical guides on e-waste, safe disposal, reuse, repair, recycling and protecting your data.', style: theme.textTheme.bodyMedium),
      itemBuilder: (context, a) => Semantics(
        button: true,
        child: GlassContainer(
          padding: EdgeInsets.zero,
          child: Material(
            type: MaterialType.transparency,
            child: InkWell(
              onTap: () => context.push(Routes.article(a.slug)),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(a.title, style: theme.textTheme.titleMedium),
                    if (a.summary.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(a.summary, style: theme.textTheme.bodyMedium)),
                    Padding(padding: const EdgeInsets.only(top: 8), child: Text('${a.readMinutes} min read', style: theme.textTheme.bodySmall)),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
      emptyTitle: 'No guides yet',
      emptyMessage: 'Guides appear here once they are published.',
      emptyIcon: Icons.menu_book_outlined,
      skeletonHeight: 100,
    );
  }
}

class LearnPage extends StatelessWidget {
  const LearnPage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        extendBodyBehindAppBar: true,
        appBar: glassAppBar(context, 'Learning centre'),
        body: const AppBackground(child: SafeArea(child: LearnScreen())),
      );
}

/// One guide. "Not found" is the server's answer for a guide that was unpublished or never existed.
class ArticleScreen extends ConsumerWidget {
  const ArticleScreen({super.key, required this.slug});

  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final article = ref.watch(articleProvider(slug));
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Guide'),
      body: AppBackground(
        child: SafeArea(
          child: article.when(
            loading: () => ListView(padding: const EdgeInsets.all(20), children: const [Skeleton(height: 40, radius: 12), SizedBox(height: 16), Skeleton(height: 200, radius: 24)]),
            error: (e, _) {
              final err = ApiException.from(e);
              return ListView(padding: const EdgeInsets.all(20), children: [
                err.statusCode == 404
                    ? const EmptyState(icon: Icons.menu_book_outlined, title: 'Guide not found', message: 'It may have been taken down.')
                    : ErrorState(error: err, onRetry: () => ref.invalidate(articleProvider(slug))),
              ]);
            },
            data: (a) => RefreshIndicator(
              onRefresh: () async => ref.invalidate(articleProvider(slug)),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
                children: [
                  Semantics(header: true, child: Text(a.title, style: theme.textTheme.headlineMedium)),
                  if (a.summary.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(a.summary, style: theme.textTheme.bodyLarge)),
                  Padding(padding: const EdgeInsets.only(top: 4, bottom: 16), child: Text('${a.readMinutes} min read', style: theme.textTheme.bodySmall)),
                  MarkdownView(source: a.body),
                  if (a.nextSlug != null) ...[
                    const SizedBox(height: 24),
                    OutlinedButton.icon(onPressed: () => context.pushReplacement(Routes.article(a.nextSlug!)), icon: const Icon(Icons.arrow_forward), label: Text('Next: ${a.nextTitle ?? ''}')),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}