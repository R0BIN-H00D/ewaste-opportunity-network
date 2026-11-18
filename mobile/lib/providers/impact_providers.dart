import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/impact.dart';
import '../services/impact_repository.dart';
import 'auth_controller.dart';
import 'core_providers.dart';

final impactRepositoryProvider = Provider<ImpactRepository>(
    (ref) => ImpactRepository(ref.watch(apiClientProvider)));

final impactSummaryProvider = FutureProvider.autoDispose<ImpactSummary>((ref) {
  ref.watch(authControllerProvider.select((s) => s.user?.id));
  return ref.watch(impactRepositoryProvider).summary();
});

final monthlyImpactProvider =
    FutureProvider.autoDispose<List<MonthImpact>>((ref) {
  ref.watch(authControllerProvider.select((s) => s.user?.id));
  return ref.watch(impactRepositoryProvider).monthly();
});

final yearlyImpactProvider =
    FutureProvider.autoDispose<List<BreakdownRow>>((ref) {
  ref.watch(authControllerProvider.select((s) => s.user?.id));
  return ref.watch(impactRepositoryProvider).yearly();
});

final categoryImpactProvider =
    FutureProvider.autoDispose<List<BreakdownRow>>((ref) {
  ref.watch(authControllerProvider.select((s) => s.user?.id));
  return ref.watch(impactRepositoryProvider).byCategory();
});
