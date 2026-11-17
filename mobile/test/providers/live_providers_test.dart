import 'dart:async';
import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/models/page_result.dart';
import 'package:ewaste_opportunity/providers/chat_providers.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/providers/live_providers.dart';
import 'package:ewaste_opportunity/providers/paged.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import '../fakes.dart';

const _short = Duration(milliseconds: 20);
Future<void> _wait([Duration d = const Duration(milliseconds: 80)]) => Future<void>.delayed(d);

class _Counted extends PagedNotifier<int> {
  static int fetches = 0;

  @override
  Paged<int> build() => start();

  @override
  Future<PageResult<int>> fetch(int page) async {
    fetches++;
    return PageResult(items: [fetches], page: 1, pages: 1, total: 1);
  }
}

final _countedProvider = NotifierProvider<_Counted, Paged<int>>(_Counted.new);

ProviderContainer _container(FakeRealtime live, {List<ProviderObserver> observers = const []}) {
  final c = ProviderContainer(overrides: [realtimeServiceProvider.overrideWithValue(live), liveDelayProvider.overrideWithValue(_short)], observers: observers);
  addTearDown(c.dispose);
  return c;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => _Counted.fetches = 0);

  group('the live tick', () {
    test('goes up once for a burst of changes', () async {
      final live = FakeRealtime();
      final c = _container(live);
      final ticks = <int>[];
      c.listen<int>(liveTickProvider, (_, n) => ticks.add(n), fireImmediately: false);
      for (var i = 0; i < 10; i++) {
        live.pushChange('listing', 'l$i');
      }
      await _wait();
      expect(ticks, [1]);
      live.pushChange('request', 'r1', 'deleted');
      await _wait();
      expect(ticks, [1, 2]);
    });

    test('does nothing when nothing changes, and the first connection is not a change', () async {
      final live = FakeRealtime();
      final c = _container(live);
      final ticks = <int>[];
      c.listen<int>(liveTickProvider, (_, n) => ticks.add(n));
      live.pushConnection(true);
      await _wait();
      expect(ticks, isEmpty);
    });

    test('a connection that comes back after a gap catches up', () async {
      final live = FakeRealtime();
      final c = _container(live);
      final ticks = <int>[];
      c.listen<int>(liveTickProvider, (_, n) => ticks.add(n));
      live.pushConnection(true);
      live.pushConnection(false);
      await _wait();
      expect(ticks, isEmpty); // going offline is not a change
      live.pushConnection(true);
      await _wait();
      expect(ticks, [1]);
    });

    test('waits for the app to come back to the front before refreshing', () async {
      final live = FakeRealtime();
      final c = _container(live);
      final ticks = <int>[];
      c.listen<int>(liveTickProvider, (_, n) => ticks.add(n));
      TestWidgetsFlutterBinding.instance.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      addTearDown(() => TestWidgetsFlutterBinding.instance.handleAppLifecycleStateChanged(AppLifecycleState.resumed));
      live.pushChange('order', 'o1');
      await _wait();
      expect(ticks, isEmpty);
      TestWidgetsFlutterBinding.instance.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      TestWidgetsFlutterBinding.instance.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await _wait();
      expect(ticks, [1]);
    });

    test('stops when the connection is closed', () async {
      final live = FakeRealtime();
      final c = _container(live);
      final ticks = <int>[];
      final sub = c.listen<int>(liveTickProvider, (_, n) => ticks.add(n));
      sub.close();
      c.dispose();
      live.pushChange('listing', 'x');
      await _wait();
      expect(ticks, isEmpty);
    });
  });

  group('lists', () {
    test('fetch their first page again on a change, and keep what they have meanwhile', () async {
      final live = FakeRealtime();
      final c = _container(live);
      c.listen(_countedProvider, (_, __) {});
      await _wait();
      expect(_Counted.fetches, 1);
      expect(c.read(_countedProvider).items, [1]);

      live.pushChange('listing', 'l1');
      await _wait(const Duration(milliseconds: 15)); // before the burst delay ends: nothing yet
      expect(_Counted.fetches, 1);
      await _wait();
      expect(_Counted.fetches, 2);
      expect(c.read(_countedProvider).items, [2]);
    });
  });

  group('the refresh observer', () {
    test('refetches data providers on a change and leaves other providers alone', () async {
      final live = FakeRealtime();
      var builds = 0;
      var plainBuilds = 0;
      final data = FutureProvider.autoDispose<int>((ref) async => ++builds);
      final plain = Provider.autoDispose<int>((ref) => ++plainBuilds);
      final observer = LiveRefreshObserver();
      final c = _container(live, observers: [observer]);
      c.listen(data, (_, __) {});
      c.listen(plain, (_, __) {});
      await _wait();
      expect(builds, 1);
      expect(observer.trackedCount, 1); // only the one that holds fetched data

      live.pushChange('request', 'r1');
      await _wait(const Duration(milliseconds: 150));
      expect(builds, 2);
      expect(plainBuilds, 1);
      expect(c.read(data).value, 2);
    });

    test('keeps the old value on screen while it fetches again', () async {
      final live = FakeRealtime();
      var builds = 0;
      final gate = Completer<void>();
      final data = FutureProvider.autoDispose<int>((ref) async {
        final n = ++builds;
        if (n == 2) await gate.future;
        return n;
      });
      final c = _container(live, observers: [LiveRefreshObserver()]);
      c.listen(data, (_, __) {});
      await _wait();
      live.pushChange('listing', 'l1');
      await _wait(const Duration(milliseconds: 150));
      final during = c.read(data);
      expect(during.isLoading, isTrue);
      expect(during.value, 1); // the previous answer is still there
      gate.complete();
      await _wait();
      expect(c.read(data).value, 2);
    });

    test('forgets a provider once it is gone, and skips the start-up checks', () async {
      final live = FakeRealtime();
      final data = FutureProvider.autoDispose<int>((ref) async => 1);
      final observer = LiveRefreshObserver();
      final c = _container(live, observers: [observer]);
      final sub = c.listen(data, (_, __) {});
      await _wait();
      expect(observer.trackedCount, 1);
      sub.close();
      await _wait();
      expect(observer.trackedCount, 0);

      c.read(healthProvider);
      expect(observer.trackedCount, 0);
    });

    test('a failing fetch does not stop the others', () async {
      final live = FakeRealtime();
      var good = 0;
      final bad = FutureProvider.autoDispose<int>((ref) async => throw const ApiException('down', failure: ApiFailure.network));
      final fine = FutureProvider.autoDispose<int>((ref) async => ++good);
      final c = _container(live, observers: [LiveRefreshObserver()]);
      c.listen(bad, (_, __) {});
      c.listen(fine, (_, __) {});
      await _wait();
      live.pushChange('order', 'o1');
      await _wait(const Duration(milliseconds: 150));
      expect(good, 2);
    });
  });
}