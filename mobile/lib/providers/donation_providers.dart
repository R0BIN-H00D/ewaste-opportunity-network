import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/donation.dart';
import '../models/page_result.dart';
import '../services/donation_repository.dart';
import 'auth_controller.dart';
import 'core_providers.dart';
import 'paged.dart';
import 'technicians_controller.dart' show requestPollIntervalProvider;

final donationRepositoryProvider = Provider<DonationRepository>((ref) => DonationRepository(ref.watch(apiClientProvider)));

/// The donation list's search, category, condition and scope (open marketplace, my offers, what I asked for). Changing it reloads the list.
final donationQueryProvider = StateProvider<DonationQuery>((ref) => const DonationQuery());

class DonationsController extends PagedNotifier<Donation> {
  @override
  Paged<Donation> build() {
    ref.watch(donationQueryProvider);
    ref.watch(authControllerProvider.select((s) => s.user?.id));
    return start();
  }

  @override
  Future<PageResult<Donation>> fetch(int page) => ref.read(donationRepositoryProvider).donations(ref.read(donationQueryProvider).copyWith(page: page));
}

final donationsProvider = NotifierProvider<DonationsController, Paged<Donation>>(DonationsController.new);

bool _appInForeground() {
  try {
    final state = WidgetsBinding.instance.lifecycleState;
    return state == null || state == AppLifecycleState.resumed;
  } catch (_) {
    return true;
  }
}

/// One donation. Every action answers with the updated donation, which [run] puts straight into the state.
/// While it is open and on screen it is fetched again every [requestPollIntervalProvider].
class DonationController extends AutoDisposeFamilyAsyncNotifier<Donation, String> {
  int _writes = 0;

  @override
  Future<Donation> build(String arg) {
    ref.watch(authControllerProvider.select((s) => s.user?.id));
    final timer = Timer.periodic(ref.watch(requestPollIntervalProvider), (_) => _poll());
    ref.onDispose(timer.cancel);
    return ref.watch(donationRepositoryProvider).donation(arg);
  }

  Future<void> _poll() async {
    final current = state.valueOrNull;
    if (current == null || state.isLoading || current.isFinished || !_appInForeground()) return;
    final asOf = _writes;
    try {
      final fresh = await ref.read(donationRepositoryProvider).donation(arg);
      if (asOf != _writes) return;
      state = AsyncData(fresh);
      if (fresh.status != current.status) ref.invalidate(donationsProvider);
    } catch (_) {
      // Offline or a server hiccup: try again on the next tick.
    }
  }

  /// Runs one action. The error, if any, goes to the caller to show; the donation on screen stays as it was.
  Future<void> run(Future<Donation> Function(DonationRepository repo) action) async {
    final updated = await action(ref.read(donationRepositoryProvider));
    _writes++;
    state = AsyncData(updated);
    ref.invalidate(donationsProvider);
  }

  Future<void> refresh() async {
    final fresh = await AsyncValue.guard(() => ref.read(donationRepositoryProvider).donation(arg));
    _writes++;
    state = fresh;
  }
}

final donationProvider = AsyncNotifierProvider.autoDispose.family<DonationController, Donation, String>(DonationController.new);

final donationConfirmationProvider = FutureProvider.autoDispose.family<DonationConfirmation, String>((ref, id) => ref.watch(donationRepositoryProvider).confirmation(id));

/// Whether the signed-in person's organisation may ask for donations.
final recipientStatusProvider = FutureProvider.autoDispose<RecipientStatus>((ref) {
  ref.watch(authControllerProvider.select((s) => s.user?.id));
  return ref.watch(donationRepositoryProvider).recipientStatus();
});
