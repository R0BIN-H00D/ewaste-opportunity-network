import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/network/api_exception.dart';
import '../models/page_result.dart';

/// A list that arrives page by page.
class Paged<T> {
  const Paged({this.items = const [], this.page = 0, this.pages = 1, this.total = 0, this.loading = false, this.loadingMore = false, this.error, this.loaded = false});

  final List<T> items;
  final int page;
  final int pages;
  final int total;

  /// The first page is on its way.
  final bool loading;

  /// A further page is on its way.
  final bool loadingMore;
  final ApiException? error;

  /// At least one answer has arrived (so an empty list means "nothing here", not "not yet").
  final bool loaded;

  bool get hasMore => page < pages;

  Paged<T> copyWith({List<T>? items, int? page, int? pages, int? total, bool? loading, bool? loadingMore, ApiException? error, bool clearError = false, bool? loaded}) => Paged<T>(
        items: items ?? this.items,
        page: page ?? this.page,
        pages: pages ?? this.pages,
        total: total ?? this.total,
        loading: loading ?? this.loading,
        loadingMore: loadingMore ?? this.loadingMore,
        error: clearError ? null : (error ?? this.error),
        loaded: loaded ?? this.loaded,
      );
}

/// Shared paging for the new lists. A subclass says how to fetch a page ([fetch]) and calls [start] from `build`, after watching
/// whatever should reset the list (the filters, the signed-in person). Answers for an old filter that arrive late are thrown away.
abstract class PagedNotifier<T> extends Notifier<Paged<T>> {
  int _ticket = 0;

  Future<PageResult<T>> fetch(int page);

  /// Call as the last step of `build`; returns the first state, which is already "loading".
  Paged<T> start() {
    Future.microtask(load);
    // Not `const`: a constant cannot carry the type parameter, and would become Paged<Never>, which cannot hold items.
    return Paged<T>(loading: true);
  }

  Future<void> load() async {
    final ticket = ++_ticket;
    state = state.copyWith(loading: true, loadingMore: false, clearError: true);
    try {
      final page = await fetch(1);
      if (ticket != _ticket) return;
      state = state.copyWith(items: page.items, page: page.page, pages: page.pages, total: page.total, loading: false, loaded: true);
    } on ApiException catch (e) {
      if (ticket != _ticket) return;
      state = state.copyWith(loading: false, error: e);
    }
  }

  Future<void> loadMore() async {
    if (state.loading || state.loadingMore || !state.hasMore) return;
    final ticket = _ticket;
    state = state.copyWith(loadingMore: true, clearError: true);
    try {
      final next = await fetch(state.page + 1);
      if (ticket != _ticket) return;
      state = state.copyWith(items: [...state.items, ...next.items], page: next.page, pages: next.pages, total: next.total, loadingMore: false);
    } on ApiException catch (e) {
      if (ticket != _ticket) return;
      state = state.copyWith(loadingMore: false, error: e);
    }
  }
}
