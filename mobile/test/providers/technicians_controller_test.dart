import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/models/service_request.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/providers/technicians_controller.dart';
import 'package:ewaste_opportunity/services/request_repository.dart';
import 'package:ewaste_opportunity/services/technician_repository.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import '../fakes.dart';
import '../helpers.dart';

ProviderContainer _container({TechnicianRepository? technicians, RequestRepository? requests, Duration? pollEvery}) {
  final container = ProviderContainer(overrides: [
    keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
    authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
    if (technicians != null) technicianRepositoryProvider.overrideWithValue(technicians),
    if (requests != null) requestRepositoryProvider.overrideWithValue(requests),
    if (pollEvery != null) requestPollIntervalProvider.overrideWithValue(pollEvery),
  ]);
  addTearDown(container.dispose);
  return container;
}

Future<void> _settle() => Future<void>.delayed(Duration.zero);

/// Answers the first fetch, then fails while [failing] is set.
class _FlakyRequestRepository extends FakeRequestRepository {
  _FlakyRequestRepository(ServiceRequest request) : super(current: request);

  bool failing = false;

  @override
  Future<ServiceRequest> get(String id) async {
    if (failing) throw ApiException.offline;
    return current;
  }
}

void main() {
  group('techniciansProvider', () {
    test('loads the first page when it is first read', () async {
      final repo = FakeTechnicianRepository(pages: {1: [sampleTechnician(id: 'a'), sampleTechnician(id: 'b')]});
      final container = _container(technicians: repo);

      expect(container.read(techniciansProvider).loading, isTrue);
      await _settle();

      final state = container.read(techniciansProvider);
      expect(state.loaded, isTrue);
      expect(state.items.map((t) => t.id), ['a', 'b']);
    });

    test('changing the filters starts again from the first page', () async {
      final repo = FakeTechnicianRepository(pages: {1: [sampleTechnician()]});
      final container = _container(technicians: repo);
      container.read(techniciansProvider);
      await _settle();

      container.read(technicianQueryProvider.notifier).update((q) => q.copyWith(availableOnly: true));
      container.read(techniciansProvider);
      await _settle();

      expect(repo.queries.last.availableOnly, isTrue);
      expect(repo.queries.last.page, 1);
    });

    test('loadMore adds the next page and stops at the last one', () async {
      final repo = FakeTechnicianRepository(pages: {1: [sampleTechnician(id: 'a')], 2: [sampleTechnician(id: 'b')]}, pageCount: 2);
      final container = _container(technicians: repo);
      container.read(techniciansProvider);
      await _settle();

      await container.read(techniciansProvider.notifier).loadMore();
      expect(container.read(techniciansProvider).items.map((t) => t.id), ['a', 'b']);
      expect(container.read(techniciansProvider).hasMore, isFalse);

      await container.read(techniciansProvider.notifier).loadMore();
      expect(repo.queries.where((q) => q.page == 3), isEmpty);
    });

    test('a failure is kept for the screen to show', () async {
      final container = _container(technicians: FakeTechnicianRepository(error: ApiException.offline));
      container.read(techniciansProvider);
      await _settle();
      final state = container.read(techniciansProvider);
      expect(state.error?.isNetwork, isTrue);
      expect(state.loaded, isFalse);
    });
  });

  group('requestsProvider', () {
    test('"open only" is passed to the server', () async {
      final repo = FakeRequestRepository(pages: {1: [sampleRequest()]});
      final container = _container(requests: repo);
      container.read(requestsProvider);
      await _settle();
      expect(repo.listCalls.first.activeOnly, isFalse);

      container.read(requestsActiveOnlyProvider.notifier).state = true;
      container.read(requestsProvider);
      await _settle();
      expect(repo.listCalls.last.activeOnly, isTrue);
    });
  });

  group('requestProvider', () {
    test('loads one request, and an action puts the answer straight in', () async {
      final repo = FakeRequestRepository(current: sampleRequest(status: 'customer_approval_pending', quote: true))
        ..result = sampleRequest(status: 'repair_in_progress');
      final container = _container(requests: repo);
      final sub = container.listen(requestProvider('r1'), (_, __) {});
      addTearDown(sub.close);

      final first = await container.read(requestProvider('r1').future);
      expect(first.status, 'customer_approval_pending');

      await container.read(requestProvider('r1').notifier).run((r) => r.decideQuotation('r1', 'q1', accept: true));
      expect(container.read(requestProvider('r1')).value?.status, 'repair_in_progress');
      expect(repo.calls, ['approve:q1::again']);
    });

    test('a refused action leaves the request as it was and throws to the caller', () async {
      final repo = FakeRequestRepository(current: sampleRequest(status: 'customer_approval_pending'))
        ..actionError = const ApiException('Expired', failure: ApiFailure.conflict, statusCode: 409);
      final container = _container(requests: repo);
      final sub = container.listen(requestProvider('r1'), (_, __) {});
      addTearDown(sub.close);
      await container.read(requestProvider('r1').future);

      await expectLater(container.read(requestProvider('r1').notifier).run((r) => r.cancel('r1')), throwsA(isA<ApiException>()));
      expect(container.read(requestProvider('r1')).value?.status, 'customer_approval_pending');
    });

    const tick = Duration(milliseconds: 20);
    Future<void> afterTicks(int n) => Future<void>.delayed(tick * n + const Duration(milliseconds: 10));

    test('a step the technician takes shows up without a refresh', () async {
      final repo = FakeRequestRepository(current: sampleRequest(status: 'device_collection_pending'));
      final container = _container(requests: repo, pollEvery: tick);
      final sub = container.listen(requestProvider('r1'), (_, __) {});
      addTearDown(sub.close);
      await container.read(requestProvider('r1').future);

      repo.current = sampleRequest(status: 'device_collected');
      await afterTicks(2);
      expect(container.read(requestProvider('r1')).value?.status, 'device_collected');
    });

    test('a finished request is not fetched again', () async {
      final repo = FakeRequestRepository(current: sampleRequest(status: 'service_completed'));
      final container = _container(requests: repo, pollEvery: tick);
      final sub = container.listen(requestProvider('r1'), (_, __) {});
      addTearDown(sub.close);
      await container.read(requestProvider('r1').future);

      repo.current = sampleRequest(status: 'cancelled');
      await afterTicks(3);
      expect(container.read(requestProvider('r1')).value?.status, 'service_completed');
    });

    test('a failed re-fetch keeps the request on screen', () async {
      final repo = _FlakyRequestRepository(sampleRequest(status: 'repair_in_progress'));
      final container = _container(requests: repo, pollEvery: tick);
      final sub = container.listen(requestProvider('r1'), (_, __) {});
      addTearDown(sub.close);
      await container.read(requestProvider('r1').future);

      repo.failing = true;
      await afterTicks(2);
      final state = container.read(requestProvider('r1'));
      expect(state.hasError, isFalse);
      expect(state.value?.status, 'repair_in_progress');
    });
  });
}
