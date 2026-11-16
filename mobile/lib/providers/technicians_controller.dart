import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/listing.dart';
import '../models/page_result.dart';
import '../models/service_request.dart';
import '../models/technician.dart';
import '../services/request_repository.dart';
import '../services/technician_repository.dart';
import 'auth_controller.dart';
import '../services/device_repository.dart';
import 'core_providers.dart';
import 'listings_controller.dart';
import 'paged.dart';

final technicianRepositoryProvider = Provider<TechnicianRepository>((ref) => TechnicianRepository(ref.watch(apiClientProvider)));
final requestRepositoryProvider = Provider<RequestRepository>((ref) => RequestRepository(ref.watch(apiClientProvider)));

/// The directory's current search and filters. Changing it reloads the list.
final technicianQueryProvider = StateProvider<TechnicianQuery>((ref) => const TechnicianQuery());

class TechniciansController extends PagedNotifier<Technician> {
  @override
  Paged<Technician> build() {
    ref.watch(technicianQueryProvider);
    ref.watch(authControllerProvider.select((s) => s.user?.id));
    return start();
  }

  @override
  Future<PageResult<Technician>> fetch(int page) =>
      ref.read(technicianRepositoryProvider).list(ref.read(technicianQueryProvider).copyWith(page: page));
}

final techniciansProvider = NotifierProvider<TechniciansController, Paged<Technician>>(TechniciansController.new);

final technicianProvider = FutureProvider.autoDispose.family<Technician, String>((ref, id) => ref.watch(technicianRepositoryProvider).get(id));

/// Show only requests that are still open (not finished, declined or cancelled).
final requestsActiveOnlyProvider = StateProvider<bool>((ref) => false);

class RequestsController extends PagedNotifier<ServiceRequest> {
  @override
  Paged<ServiceRequest> build() {
    ref.watch(requestsActiveOnlyProvider);
    ref.watch(authControllerProvider.select((s) => s.user?.id));
    return start();
  }

  @override
  Future<PageResult<ServiceRequest>> fetch(int page) =>
      ref.read(requestRepositoryProvider).list(activeOnly: ref.read(requestsActiveOnlyProvider), page: page);
}

final requestsProvider = NotifierProvider<RequestsController, Paged<ServiceRequest>>(RequestsController.new);

/// How often an open request on screen is fetched again, so steps the other side takes show up without a pull to refresh.
final requestPollIntervalProvider = Provider<Duration>((ref) => const Duration(seconds: 15));

/// True unless the app is known to be in the background (no binding, as in plain unit tests, counts as foreground).
bool _appInForeground() {
  try {
    final state = WidgetsBinding.instance.lifecycleState;
    return state == null || state == AppLifecycleState.resumed;
  } catch (_) {
    return true;
  }
}

/// One request. Every action answers with the updated request, which [run] puts straight into the state (no reload flash).
/// While the request is open and on screen, it is fetched again every [requestPollIntervalProvider].
class RequestController extends AutoDisposeFamilyAsyncNotifier<ServiceRequest, String> {
  /// Counts answers from actions and refreshes, so a slower poll never overwrites a newer one.
  int _writes = 0;

  @override
  Future<ServiceRequest> build(String arg) {
    ref.watch(authControllerProvider.select((s) => s.user?.id));
    final timer = Timer.periodic(ref.watch(requestPollIntervalProvider), (_) => _poll());
    ref.onDispose(timer.cancel);
    return ref.watch(requestRepositoryProvider).get(arg);
  }

  /// A quiet re-fetch: skipped in the background or once the request is finished, and a failure keeps what is on screen.
  Future<void> _poll() async {
    final current = state.valueOrNull;
    if (current == null || state.isLoading || current.isFinished || !_appInForeground()) return;
    final asOf = _writes;
    try {
      final fresh = await ref.read(requestRepositoryProvider).get(arg);
      if (asOf != _writes) return; // an action or refresh answered while this was in flight; its answer is newer
      state = AsyncData(fresh);
      if (fresh.status != current.status) ref.invalidate(requestsProvider);
    } catch (_) {
      // Offline or a server hiccup: try again on the next tick.
    }
  }

  /// Runs one action. The error, if any, goes to the caller to show; the request on screen stays as it was.
  Future<void> run(Future<ServiceRequest> Function(RequestRepository repo) action) async {
    final updated = await action(ref.read(requestRepositoryProvider));
    _writes++;
    state = AsyncData(updated);
    ref.invalidate(requestsProvider); // the list shows the status too
  }

  /// Fetches the request again, for pull-to-refresh and after a "someone else changed it" answer.
  Future<void> refresh() async {
    final fresh = await AsyncValue.guard(() => ref.read(requestRepositoryProvider).get(arg));
    _writes++;
    state = fresh;
  }
}

final requestProvider = AsyncNotifierProvider.autoDispose.family<RequestController, ServiceRequest, String>(RequestController.new);

/// The person's own listings that can be sent to a technician: published, and meant for repair (BR-03 locks the rest).
final repairableListingsProvider = FutureProvider.autoDispose<List<Listing>>((ref) async {
  ref.watch(authControllerProvider.select((s) => s.user?.id));
  final page = await ref.watch(deviceRepositoryProvider).list(const ListingQuery(mine: true, status: 'listed', service: 'repair', limit: 50));
  return page.items;
});
