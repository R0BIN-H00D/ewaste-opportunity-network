import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/marketplace.dart';
import '../models/page_result.dart';
import '../models/refurbishment.dart';
import '../services/refurbishment_repository.dart';
import 'auth_controller.dart';
import 'core_providers.dart';
import 'marketplace_providers.dart';
import 'paged.dart';
import 'technicians_controller.dart' show requestPollIntervalProvider;

final refurbishmentRepositoryProvider = Provider<RefurbishmentRepository>((ref) => RefurbishmentRepository(ref.watch(apiClientProvider)));

/// The feed's search, category and condition. Changing it reloads the feed.
final refurbOpportunityQueryProvider = StateProvider<RefurbOpportunityQuery>((ref) => const RefurbOpportunityQuery());

class RefurbOpportunitiesController extends PagedNotifier<RefurbOpportunity> {
  @override
  Paged<RefurbOpportunity> build() {
    ref.watch(refurbOpportunityQueryProvider);
    ref.watch(authControllerProvider.select((s) => s.user?.id));
    return start();
  }

  @override
  Future<PageResult<RefurbOpportunity>> fetch(int page) =>
      ref.read(refurbishmentRepositoryProvider).opportunities(ref.read(refurbOpportunityQueryProvider).copyWith(page: page));
}

final refurbOpportunitiesProvider = NotifierProvider<RefurbOpportunitiesController, Paged<RefurbOpportunity>>(RefurbOpportunitiesController.new);

/// Which side of the jobs the list shows (`refurbisher` or `owner`; empty for the role's usual) and which status.
final refurbJobScopeProvider = StateProvider<String>((ref) => '');
final refurbJobStatusProvider = StateProvider<String>((ref) => '');

class RefurbJobsController extends PagedNotifier<RefurbJob> {
  @override
  Paged<RefurbJob> build() {
    ref.watch(refurbJobScopeProvider);
    ref.watch(refurbJobStatusProvider);
    ref.watch(authControllerProvider.select((s) => s.user?.id));
    return start();
  }

  @override
  Future<PageResult<RefurbJob>> fetch(int page) =>
      ref.read(refurbishmentRepositoryProvider).jobs(as: ref.read(refurbJobScopeProvider), status: ref.read(refurbJobStatusProvider), page: page);
}

final refurbJobsProvider = NotifierProvider<RefurbJobsController, Paged<RefurbJob>>(RefurbJobsController.new);

bool _appInForeground() {
  try {
    final state = WidgetsBinding.instance.lifecycleState;
    return state == null || state == AppLifecycleState.resumed;
  } catch (_) {
    return true;
  }
}

/// One job. Every action answers with the updated job, which [run] puts straight into the state.
/// While it is open and on screen it is fetched again every [requestPollIntervalProvider].
class RefurbJobController extends AutoDisposeFamilyAsyncNotifier<RefurbJob, String> {
  int _writes = 0;

  @override
  Future<RefurbJob> build(String arg) {
    ref.watch(authControllerProvider.select((s) => s.user?.id));
    final timer = Timer.periodic(ref.watch(requestPollIntervalProvider), (_) => _poll());
    ref.onDispose(timer.cancel);
    return ref.watch(refurbishmentRepositoryProvider).job(arg);
  }

  Future<void> _poll() async {
    final current = state.valueOrNull;
    if (current == null || state.isLoading || current.isFinished || !_appInForeground()) return;
    final asOf = _writes;
    try {
      final fresh = await ref.read(refurbishmentRepositoryProvider).job(arg);
      if (asOf != _writes) return;
      state = AsyncData(fresh);
      if (fresh.status != current.status) ref.invalidate(refurbJobsProvider);
    } catch (_) {
      // Offline or a server hiccup: try again on the next tick.
    }
  }

  /// Runs one action. The error, if any, goes to the caller to show; the job on screen stays as it was.
  Future<void> run(Future<RefurbJob> Function(RefurbishmentRepository repo) action) async {
    final updated = await action(ref.read(refurbishmentRepositoryProvider));
    _writes++;
    state = AsyncData(updated);
    ref.invalidate(refurbJobsProvider);
  }

  Future<void> refresh() async {
    final fresh = await AsyncValue.guard(() => ref.read(refurbishmentRepositoryProvider).job(arg));
    _writes++;
    state = fresh;
  }
}

final refurbJobProvider = AsyncNotifierProvider.autoDispose.family<RefurbJobController, RefurbJob, String>(RefurbJobController.new);

/// The status filter of the refurbisher's own product list (empty for all).
final myProductStatusProvider = StateProvider<String>((ref) => '');

class MyProductsController extends PagedNotifier<Product> {
  @override
  Paged<Product> build() {
    ref.watch(myProductStatusProvider);
    ref.watch(authControllerProvider.select((s) => s.user?.id));
    return start();
  }

  @override
  Future<PageResult<Product>> fetch(int page) => ref.read(marketplaceRepositoryProvider).mine(status: ref.read(myProductStatusProvider), page: page);
}

final myProductsProvider = NotifierProvider<MyProductsController, Paged<Product>>(MyProductsController.new);
