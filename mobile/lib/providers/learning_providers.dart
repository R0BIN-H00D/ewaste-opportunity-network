import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/learning.dart';
import '../models/page_result.dart';
import '../services/learning_repository.dart';
import 'auth_controller.dart';
import 'core_providers.dart';
import 'paged.dart';
import 'technicians_controller.dart' show requestPollIntervalProvider;

final learningRepositoryProvider = Provider<LearningRepository>((ref) => LearningRepository(ref.watch(apiClientProvider)));

/// The opportunities list's search, difficulty and category. Changing it reloads the list.
final opportunityQueryProvider = StateProvider<OpportunityQuery>((ref) => const OpportunityQuery());

class OpportunitiesController extends PagedNotifier<Opportunity> {
  @override
  Paged<Opportunity> build() {
    ref.watch(opportunityQueryProvider);
    ref.watch(authControllerProvider.select((s) => s.user?.id));
    return start();
  }

  @override
  Future<PageResult<Opportunity>> fetch(int page) => ref.read(learningRepositoryProvider).opportunities(ref.read(opportunityQueryProvider).copyWith(page: page));
}

final opportunitiesProvider = NotifierProvider<OpportunitiesController, Paged<Opportunity>>(OpportunitiesController.new);

/// One opportunity. Re-read when the person signs in or out, because the server tells a student whether they can apply.
final opportunityProvider = FutureProvider.autoDispose.family<Opportunity, String>((ref, id) {
  ref.watch(authControllerProvider.select((s) => s.user?.id));
  return ref.watch(learningRepositoryProvider).opportunity(id);
});

/// Which applications the list shows: one status, or empty for all.
final applicationStatusFilterProvider = StateProvider<String>((ref) => '');

class ApplicationsController extends PagedNotifier<Application> {
  @override
  Paged<Application> build() {
    ref.watch(applicationStatusFilterProvider);
    ref.watch(authControllerProvider.select((s) => s.user?.id));
    return start();
  }

  @override
  Future<PageResult<Application>> fetch(int page) => ref.read(learningRepositoryProvider).applications(status: ref.read(applicationStatusFilterProvider), page: page);
}

final applicationsProvider = NotifierProvider<ApplicationsController, Paged<Application>>(ApplicationsController.new);

bool _appInForeground() {
  try {
    final state = WidgetsBinding.instance.lifecycleState;
    return state == null || state == AppLifecycleState.resumed;
  } catch (_) {
    return true;
  }
}

/// One application. Every action answers with the updated application, which [run] puts straight into the state.
/// While it is open and on screen it is fetched again every [requestPollIntervalProvider].
class ApplicationController extends AutoDisposeFamilyAsyncNotifier<Application, String> {
  int _writes = 0;

  @override
  Future<Application> build(String arg) {
    ref.watch(authControllerProvider.select((s) => s.user?.id));
    final timer = Timer.periodic(ref.watch(requestPollIntervalProvider), (_) => _poll());
    ref.onDispose(timer.cancel);
    return ref.watch(learningRepositoryProvider).application(arg);
  }

  Future<void> _poll() async {
    final current = state.valueOrNull;
    if (current == null || state.isLoading || current.isFinished || !_appInForeground()) return;
    final asOf = _writes;
    try {
      final fresh = await ref.read(learningRepositoryProvider).application(arg);
      if (asOf != _writes) return;
      state = AsyncData(fresh);
      if (fresh.status != current.status) ref.invalidate(applicationsProvider);
    } catch (_) {
      // Offline or a server hiccup: try again on the next tick.
    }
  }

  /// Runs one action. The error, if any, goes to the caller to show; the application on screen stays as it was.
  Future<void> run(Future<Application> Function(LearningRepository repo) action) async {
    final updated = await action(ref.read(learningRepositoryProvider));
    _writes++;
    state = AsyncData(updated);
    ref.invalidate(applicationsProvider);
  }

  Future<void> refresh() async {
    final fresh = await AsyncValue.guard(() => ref.read(learningRepositoryProvider).application(arg));
    _writes++;
    state = fresh;
  }
}

final applicationProvider = AsyncNotifierProvider.autoDispose.family<ApplicationController, Application, String>(ApplicationController.new);

final experienceProvider = FutureProvider.autoDispose<Experience>((ref) {
  ref.watch(authControllerProvider.select((s) => s.user?.id));
  return ref.watch(learningRepositoryProvider).experience();
});

final certificatesProvider = FutureProvider.autoDispose<List<Certificate>>((ref) {
  ref.watch(authControllerProvider.select((s) => s.user?.id));
  return ref.watch(learningRepositoryProvider).certificates();
});

/// Which of the supervisor's own tasks the list shows: `open`, `closed`, `filled`, or empty for all.
final myTaskStatusProvider = StateProvider<String>((ref) => '');

class MyTasksController extends PagedNotifier<Opportunity> {
  @override
  Paged<Opportunity> build() {
    ref.watch(myTaskStatusProvider);
    ref.watch(authControllerProvider.select((s) => s.user?.id));
    return start();
  }

  @override
  Future<PageResult<Opportunity>> fetch(int page) => ref.read(learningRepositoryProvider).myOpportunities(status: ref.read(myTaskStatusProvider), page: page);
}

final myTasksProvider = NotifierProvider<MyTasksController, Paged<Opportunity>>(MyTasksController.new);

/// The applications on one task, optionally one status. The key is `(opportunity id, status)`.
final applicantsProvider = FutureProvider.autoDispose.family<List<Application>, ({String id, String status})>((ref, key) async {
  ref.watch(authControllerProvider.select((s) => s.user?.id));
  final page = await ref.watch(learningRepositoryProvider).applicants(key.id, status: key.status);
  return page.items;
});
