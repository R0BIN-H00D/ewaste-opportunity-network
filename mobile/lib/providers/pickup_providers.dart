import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/page_result.dart';
import '../models/pickup.dart';
import '../services/pickup_repository.dart';
import 'auth_controller.dart';
import 'core_providers.dart';
import 'paged.dart';

final pickupRepositoryProvider = Provider<PickupRepository>(
    (ref) => PickupRepository(ref.watch(apiClientProvider)));

/// The open collection windows. Fetched fresh each time the sheet opens, so a window that filled meanwhile is not offered.
final pickupSlotsProvider = FutureProvider.autoDispose<SlotCatalogue>(
    (ref) => ref.watch(pickupRepositoryProvider).slots());

/// Whether the Pickups screen shows what is coming (true) or what is over.
final pickupsUpcomingProvider = StateProvider<bool>((ref) => true);

class PickupsController extends PagedNotifier<PickupItem> {
  @override
  Paged<PickupItem> build() {
    ref.watch(authControllerProvider.select((s) => s.user?.id));
    ref.watch(pickupsUpcomingProvider);
    return start();
  }

  @override
  Future<PageResult<PickupItem>> fetch(int page) => ref
      .read(pickupRepositoryProvider)
      .list(upcoming: ref.read(pickupsUpcomingProvider), page: page);
}

final pickupsProvider = NotifierProvider<PickupsController, Paged<PickupItem>>(
    PickupsController.new);
