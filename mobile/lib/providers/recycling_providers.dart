import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart' show DateTimeRange;
import '../models/page_result.dart';
import '../models/recycling.dart';
import '../models/recycling_report.dart';
import '../services/recycling_repository.dart';
import 'auth_controller.dart';
import 'core_providers.dart';
import 'paged.dart';
import 'technicians_controller.dart' show requestPollIntervalProvider;

final recyclingRepositoryProvider = Provider<RecyclingRepository>((ref) => RecyclingRepository(ref.watch(apiClientProvider)));

/// The directory's current search and category. Changing it reloads the list.
final centerQueryProvider = StateProvider<CenterQuery>((ref) => const CenterQuery());

class CentersController extends PagedNotifier<RecyclingCenter> {
  @override
  Paged<RecyclingCenter> build() {
    ref.watch(centerQueryProvider);
    ref.watch(authControllerProvider.select((s) => s.user?.id));
    return start();
  }

  @override
  Future<PageResult<RecyclingCenter>> fetch(int page) => ref.read(recyclingRepositoryProvider).centers(ref.read(centerQueryProvider).copyWith(page: page));
}

final centersProvider = NotifierProvider<CentersController, Paged<RecyclingCenter>>(CentersController.new);

final centerProvider = FutureProvider.autoDispose.family<RecyclingCenter, String>((ref, id) => ref.watch(recyclingRepositoryProvider).center(id));

/// Which recycling requests the list shows: one status, or empty for all.
final recyclingStatusFilterProvider = StateProvider<String>((ref) => '');

class RecyclingRequestsController extends PagedNotifier<RecyclingRequest> {
  @override
  Paged<RecyclingRequest> build() {
    ref.watch(recyclingStatusFilterProvider);
    ref.watch(authControllerProvider.select((s) => s.user?.id));
    return start();
  }

  @override
  Future<PageResult<RecyclingRequest>> fetch(int page) =>
      ref.read(recyclingRepositoryProvider).list(status: ref.read(recyclingStatusFilterProvider), page: page);
}

final recyclingRequestsProvider = NotifierProvider<RecyclingRequestsController, Paged<RecyclingRequest>>(RecyclingRequestsController.new);

bool _appInForeground() {
  try {
    final state = WidgetsBinding.instance.lifecycleState;
    return state == null || state == AppLifecycleState.resumed;
  } catch (_) {
    return true;
  }
}

/// One recycling request. Every action answers with the updated request, which [run] puts straight into the state.
/// While it is open and on screen it is fetched again every [requestPollIntervalProvider].
class RecyclingRequestController extends AutoDisposeFamilyAsyncNotifier<RecyclingRequest, String> {
  int _writes = 0;

  @override
  Future<RecyclingRequest> build(String arg) {
    ref.watch(authControllerProvider.select((s) => s.user?.id));
    final timer = Timer.periodic(ref.watch(requestPollIntervalProvider), (_) => _poll());
    ref.onDispose(timer.cancel);
    return ref.watch(recyclingRepositoryProvider).get(arg);
  }

  Future<void> _poll() async {
    final current = state.valueOrNull;
    if (current == null || state.isLoading || current.isFinished || !_appInForeground()) return;
    final asOf = _writes;
    try {
      final fresh = await ref.read(recyclingRepositoryProvider).get(arg);
      if (asOf != _writes) return;
      state = AsyncData(fresh);
      if (fresh.status != current.status) ref.invalidate(recyclingRequestsProvider);
    } catch (_) {
      // Offline or a server hiccup: try again on the next tick.
    }
  }

  /// Runs one action. The error, if any, goes to the caller to show; the request on screen stays as it was.
  Future<void> run(Future<RecyclingRequest> Function(RecyclingRepository repo) action) async {
    final updated = await action(ref.read(recyclingRepositoryProvider));
    _writes++;
    state = AsyncData(updated);
    ref.invalidate(recyclingRequestsProvider);
  }

  Future<void> refresh() async {
    final fresh = await AsyncValue.guard(() => ref.read(recyclingRepositoryProvider).get(arg));
    _writes++;
    state = fresh;
  }
}

final recyclingRequestProvider = AsyncNotifierProvider.autoDispose.family<RecyclingRequestController, RecyclingRequest, String>(RecyclingRequestController.new);

/// The days the activity report covers. Null means all time.
final recyclingReportRangeProvider = StateProvider<DateTimeRange?>((ref) => null);

final recyclingReportProvider = FutureProvider.autoDispose<RecyclingReport>((ref) {
  ref.watch(authControllerProvider.select((s) => s.user?.id));
  final range = ref.watch(recyclingReportRangeProvider);
  return ref.watch(recyclingRepositoryProvider).report(from: range?.start, to: range?.end);
});
