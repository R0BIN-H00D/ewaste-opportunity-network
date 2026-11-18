import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/wanted.dart';
import '../services/wanted_repository.dart';
import 'auth_controller.dart';
import 'core_providers.dart';

/// Overridden with a fake in tests.
final wantedRepositoryProvider = Provider<WantedRepository>((ref) => WantedRepository(ref.watch(apiClientProvider)));

/// Open requests from every refurbisher, for owners and technicians.
final wantedBoardProvider = FutureProvider.autoDispose<List<WantedRequest>>((ref) {
  ref.watch(authControllerProvider.select((s) => s.user?.id));
  return ref.watch(wantedRepositoryProvider).board();
});

/// A refurbisher's own requests.
final wantedMineProvider = FutureProvider.autoDispose<List<WantedRequest>>((ref) {
  ref.watch(authControllerProvider.select((s) => s.user?.id));
  return ref.watch(wantedRepositoryProvider).mine();
});

/// Who accepted one request.
final wantedResponsesProvider = FutureProvider.autoDispose.family<List<WantedResponse>, String>((ref, id) => ref.watch(wantedRepositoryProvider).responses(id));
