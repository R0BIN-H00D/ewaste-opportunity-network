import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/verification.dart';
import '../services/verification_repository.dart';
import 'auth_controller.dart';
import 'core_providers.dart';

final verificationRepositoryProvider = Provider<VerificationRepository>((ref) => VerificationRepository(ref.watch(apiClientProvider)));

/// The signed-in provider's verification. Invalidate it after sending or removing a document.
final verificationStatusProvider = FutureProvider.autoDispose<VerificationStatus>((ref) {
  ref.watch(authControllerProvider.select((s) => s.user?.id));
  return ref.watch(verificationRepositoryProvider).status();
});
