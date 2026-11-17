import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/network/api_exception.dart';
import '../models/listing.dart';
import '../services/device_repository.dart';
import 'auth_controller.dart';
import 'core_providers.dart';
import 'live_providers.dart';

final deviceRepositoryProvider = Provider<DeviceRepository>((ref) => DeviceRepository(ref.watch(apiClientProvider)));

/// Active categories for the filter sheet and the listing form. Cached by the server for five minutes.
final categoriesProvider = FutureProvider<List<Category>>((ref) => ref.watch(deviceRepositoryProvider).categories());

/// One listing by id. Re-read whenever the person signs in or out, because the server shows owners more than other people.
final listingProvider = FutureProvider.autoDispose.family<Listing, String>((ref, id) {
  ref.watch(authControllerProvider.select((s) => s.user?.id));
  return ref.watch(deviceRepositoryProvider).get(id);
});

class ListingsState {
  const ListingsState({
    required this.query,
    this.items = const [],
    this.page = 0,
    this.pages = 1,
    this.total = 0,
    this.loading = false,
    this.loadingMore = false,
    this.error,
    this.loaded = false,
  });

  final ListingQuery query;
  final List<Listing> items;
  final int page;
  final int pages;
  final int total;

  /// The first page is on its way.
  final bool loading;

  /// A further page is on its way.
  final bool loadingMore;
  final ApiException? error;

  /// At least one answer has arrived (so an empty list means "no results", not "not yet").
  final bool loaded;

  bool get hasMore => page < pages;

  ListingsState copyWith({
    ListingQuery? query,
    List<Listing>? items,
    int? page,
    int? pages,
    int? total,
    bool? loading,
    bool? loadingMore,
    ApiException? error,
    bool clearError = false,
    bool? loaded,
  }) =>
      ListingsState(
        query: query ?? this.query,
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

/// A browsable, filterable, endlessly scrolling list of listings. The argument says whether it is the person's own (`mine`)
/// or everyone's live listings.
class ListingsController extends FamilyNotifier<ListingsState, bool> {
  // Bumped on every fresh load, so an answer for old filters that arrives late is thrown away.
  int _ticket = 0;

  @override
  ListingsState build(bool arg) {
    // Watching who is signed in rebuilds this list for the next person, so one account never sees another's listings.
    ref.watch(authControllerProvider.select((s) => s.user?.id));
    // Fetch the first page again when the server says something changed; what is on screen stays until the answer arrives.
    ref.listen<int>(liveTickProvider, (_, __) => load());
    Future.microtask(load);
    return ListingsState(query: ListingQuery(mine: arg), loading: true);
  }

  DeviceRepository get _repo => ref.read(deviceRepositoryProvider);

  /// Loads the first page again with the current filters.
  Future<void> load() async {
    final ticket = ++_ticket;
    state = state.copyWith(loading: true, loadingMore: false, clearError: true);
    try {
      final page = await _repo.list(state.query.copyWith(page: 1));
      if (ticket != _ticket) return;
      state = state.copyWith(items: page.items, page: page.page, pages: page.pages, total: page.total, loading: false, loaded: true);
    } on ApiException catch (e) {
      if (ticket != _ticket) return;
      state = state.copyWith(loading: false, error: e);
    }
  }

  /// Loads the next page and adds it to the end.
  Future<void> loadMore() async {
    if (state.loading || state.loadingMore || !state.hasMore) return;
    final ticket = _ticket;
    state = state.copyWith(loadingMore: true, clearError: true);
    try {
      final next = await _repo.list(state.query.copyWith(page: state.page + 1));
      if (ticket != _ticket) return;
      state = state.copyWith(items: [...state.items, ...next.items], page: next.page, pages: next.pages, total: next.total, loadingMore: false);
    } on ApiException catch (e) {
      if (ticket != _ticket) return;
      state = state.copyWith(loadingMore: false, error: e);
    }
  }

  /// Changes the filters and starts again from the first page.
  Future<void> setQuery(ListingQuery Function(ListingQuery current) change) {
    state = state.copyWith(query: change(state.query));
    return load();
  }
}

final listingsProvider = NotifierProvider.family<ListingsController, ListingsState, bool>(ListingsController.new);
