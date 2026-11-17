import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/impact.dart';
import '../models/page_result.dart';
import '../services/impact_repository.dart';
import 'auth_controller.dart';
import 'core_providers.dart';
import 'paged.dart';

final impactRepositoryProvider = Provider<ImpactRepository>((ref) => ImpactRepository(ref.watch(apiClientProvider)));

/// Score, level and badges. Starts over for each person who signs in, and again when invalidated (pull to refresh).
final greenScoreProvider = FutureProvider.autoDispose<GreenScore>((ref) async {
  ref.watch(authControllerProvider.select((s) => s.user?.id));
  return (await ref.watch(impactRepositoryProvider).greenScore()).score;
});

/// The score history, newest first, a page at a time.
class LedgerController extends PagedNotifier<LedgerEntry> {
  @override
  Paged<LedgerEntry> build() {
    ref.watch(authControllerProvider.select((s) => s.user?.id));
    return start();
  }

  @override
  Future<PageResult<LedgerEntry>> fetch(int page) async => (await ref.read(impactRepositoryProvider).greenScore(page: page)).ledger;
}

final ledgerProvider = NotifierProvider<LedgerController, Paged<LedgerEntry>>(LedgerController.new);

final impactSummaryProvider = FutureProvider.autoDispose<ImpactSummary>((ref) {
  ref.watch(authControllerProvider.select((s) => s.user?.id));
  return ref.watch(impactRepositoryProvider).summary();
});

final monthlyImpactProvider = FutureProvider.autoDispose<List<MonthImpact>>((ref) {
  ref.watch(authControllerProvider.select((s) => s.user?.id));
  return ref.watch(impactRepositoryProvider).monthly();
});

final yearlyImpactProvider = FutureProvider.autoDispose<List<BreakdownRow>>((ref) {
  ref.watch(authControllerProvider.select((s) => s.user?.id));
  return ref.watch(impactRepositoryProvider).yearly();
});

final categoryImpactProvider = FutureProvider.autoDispose<List<BreakdownRow>>((ref) {
  ref.watch(authControllerProvider.select((s) => s.user?.id));
  return ref.watch(impactRepositoryProvider).byCategory();
});

/// The public scoring rules. The same for everyone, so no sign-in is needed to read them.
final scoringRulesProvider = FutureProvider.autoDispose<ScoringRules>((ref) => ref.watch(impactRepositoryProvider).rules());
