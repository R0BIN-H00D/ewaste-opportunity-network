import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/article.dart';
import '../models/page_result.dart';
import '../services/article_repository.dart';
import 'core_providers.dart';
import 'paged.dart';

final articleRepositoryProvider = Provider<ArticleRepository>((ref) => ArticleRepository(ref.watch(apiClientProvider)));

class ArticlesController extends PagedNotifier<Article> {
  @override
  Paged<Article> build() => start();

  @override
  Future<PageResult<Article>> fetch(int page) => ref.read(articleRepositoryProvider).list(page: page);
}

final articlesProvider = NotifierProvider<ArticlesController, Paged<Article>>(ArticlesController.new);

final articleProvider = FutureProvider.autoDispose.family<Article, String>((ref, slug) => ref.watch(articleRepositoryProvider).get(slug));