import 'dart:async';
import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/models/listing.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/providers/listings_controller.dart';
import 'package:ewaste_opportunity/services/device_repository.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import '../fakes.dart';
import '../helpers.dart';

ProviderContainer _container(DeviceRepository repo) {
  final container = ProviderContainer(overrides: [
    keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
    authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
    deviceRepositoryProvider.overrideWithValue(repo),
  ]);
  addTearDown(container.dispose);
  return container;
}

/// Lets the load that starts when the controller is first read finish.
Future<void> _settle() => Future<void>.delayed(Duration.zero);

void main() {
  test('loads the first page when it is first read', () async {
    final repo = FakeDeviceRepository(pages: {1: [sampleListing(id: 'a'), sampleListing(id: 'b')]});
    final container = _container(repo);

    expect(container.read(listingsProvider(false)).loading, isTrue);
    await _settle();

    final state = container.read(listingsProvider(false));
    expect(state.loading, isFalse);
    expect(state.loaded, isTrue);
    expect(state.items.map((l) => l.id), ['a', 'b']);
    expect(repo.queries.first.mine, isFalse);
  });

  test('"mine" asks for the person\'s own listings', () async {
    final repo = FakeDeviceRepository(pages: {1: [sampleListing(isOwner: true)]});
    final container = _container(repo);
    container.read(listingsProvider(true));
    await _settle();
    expect(repo.queries.first.mine, isTrue);
  });

  test('loadMore adds the next page and stops at the last one', () async {
    final repo = FakeDeviceRepository(pages: {1: [sampleListing(id: 'a')], 2: [sampleListing(id: 'b')]}, pageCount: 2);
    final container = _container(repo);
    container.read(listingsProvider(false));
    await _settle();
    final notifier = container.read(listingsProvider(false).notifier);

    expect(container.read(listingsProvider(false)).hasMore, isTrue);
    await notifier.loadMore();
    expect(container.read(listingsProvider(false)).items.map((l) => l.id), ['a', 'b']);
    expect(container.read(listingsProvider(false)).hasMore, isFalse);

    final asked = repo.queries.length;
    await notifier.loadMore();
    expect(repo.queries.length, asked, reason: 'no request after the last page');
  });

  test('changing a filter starts again from page 1', () async {
    final repo = FakeDeviceRepository(pages: {1: [sampleListing(id: 'a')]}, pageCount: 2);
    final container = _container(repo);
    container.read(listingsProvider(false));
    await _settle();

    await container.read(listingsProvider(false).notifier).setQuery((q) => q.copyWith(service: 'repair'));

    expect(repo.queries.last.service, 'repair');
    expect(repo.queries.last.page, 1);
    expect(container.read(listingsProvider(false)).query.service, 'repair');
  });

  test('an answer for old filters that arrives late is thrown away', () async {
    final slow = Completer<ListingPage>();
    final repo = _SlowFirstRepository(slow);
    final container = _container(repo);
    container.read(listingsProvider(false)); // starts the slow first load
    await _settle();

    await container.read(listingsProvider(false).notifier).setQuery((q) => q.copyWith(q: 'new'));
    expect(container.read(listingsProvider(false)).items.map((l) => l.id), ['fresh']);

    slow.complete(ListingPage(items: [sampleListing(id: 'stale')], page: 1, pages: 1, total: 1));
    await _settle();
    expect(container.read(listingsProvider(false)).items.map((l) => l.id), ['fresh']);
  });

  test('a failed first load keeps the error so it can be shown with a retry', () async {
    final repo = FakeDeviceRepository(error: ApiException.offline);
    final container = _container(repo);
    container.read(listingsProvider(false));
    await _settle();

    final state = container.read(listingsProvider(false));
    expect(state.error?.isNetwork, isTrue);
    expect(state.items, isEmpty);
    expect(state.loading, isFalse);

    repo.error = null;
    repo.pages = {1: [sampleListing()]};
    await container.read(listingsProvider(false).notifier).load();
    expect(container.read(listingsProvider(false)).error, isNull);
    expect(container.read(listingsProvider(false)).items, hasLength(1));
  });

  test('an empty answer is "loaded", not "loading"', () async {
    final container = _container(FakeDeviceRepository());
    container.read(listingsProvider(false));
    await _settle();
    final state = container.read(listingsProvider(false));
    expect(state.loaded, isTrue);
    expect(state.items, isEmpty);
  });
}

/// The first call waits for [slow]; later calls answer at once with one fresh listing.
class _SlowFirstRepository extends FakeDeviceRepository {
  _SlowFirstRepository(this.slow);

  final Completer<ListingPage> slow;
  int _calls = 0;

  @override
  Future<ListingPage> list(ListingQuery query) {
    if (_calls++ == 0) return slow.future;
    return Future.value(ListingPage(items: [sampleListing(id: 'fresh')], page: 1, pages: 1, total: 1));
  }
}
