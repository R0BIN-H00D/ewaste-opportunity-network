import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/ai_result.dart';
import '../services/ai_repository.dart';
import 'core_providers.dart';

/// Overridden with a fake in tests.
final aiRepositoryProvider = Provider<AiRepository>((ref) => AiRepository(ref.watch(apiClientProvider)));

/// Whether the server can read photos with AI right now.
final photoAiProvider = FutureProvider.autoDispose<bool>((ref) async {
  try {
    return await ref.watch(aiRepositoryProvider).photoAiOn();
  } catch (_) {
    return false; // the words-only help still works
  }
});

/// Who fits one of my devices: `technicians`, `refurbishers`, `recyclers` or `wanted`.
final matchesProvider = FutureProvider.autoDispose.family<List<MatchItem>, ({String listingId, String kind})>(
  (ref, q) => ref.watch(aiRepositoryProvider).matches(q.listingId, q.kind),
);
