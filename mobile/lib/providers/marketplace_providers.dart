import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/marketplace.dart';
import '../models/page_result.dart';
import '../services/marketplace_repository.dart';
import 'auth_controller.dart';
import 'core_providers.dart';
import 'paged.dart';
import 'technicians_controller.dart' show requestPollIntervalProvider;

final marketplaceRepositoryProvider = Provider<MarketplaceRepository>((ref) => MarketplaceRepository(ref.watch(apiClientProvider)));

/// The shop's current search, category, condition and sort. Changing it reloads the list.
final productQueryProvider = StateProvider<ProductQuery>((ref) => const ProductQuery());

class ProductsController extends PagedNotifier<Product> {
  @override
  Paged<Product> build() {
    ref.watch(productQueryProvider);
    ref.watch(authControllerProvider.select((s) => s.user?.id));
    return start();
  }

  @override
  Future<PageResult<Product>> fetch(int page) => ref.read(marketplaceRepositoryProvider).products(ref.read(productQueryProvider).copyWith(page: page));
}

final productsProvider = NotifierProvider<ProductsController, Paged<Product>>(ProductsController.new);

final productProvider = FutureProvider.autoDispose.family<Product, String>((ref, id) => ref.watch(marketplaceRepositoryProvider).product(id));

/// Which orders the list shows: one status, or empty for all.
final orderStatusFilterProvider = StateProvider<String>((ref) => '');

class OrdersController extends PagedNotifier<Order> {
  @override
  Paged<Order> build() {
    ref.watch(orderStatusFilterProvider);
    ref.watch(authControllerProvider.select((s) => s.user?.id));
    return start();
  }

  @override
  Future<PageResult<Order>> fetch(int page) => ref.read(marketplaceRepositoryProvider).orders(status: ref.read(orderStatusFilterProvider), page: page);
}

final ordersProvider = NotifierProvider<OrdersController, Paged<Order>>(OrdersController.new);

bool _appInForeground() {
  try {
    final state = WidgetsBinding.instance.lifecycleState;
    return state == null || state == AppLifecycleState.resumed;
  } catch (_) {
    return true;
  }
}

/// One order. Every action answers with the updated order, which [run] puts straight into the state.
/// While it is open and on screen it is fetched again every [requestPollIntervalProvider].
class OrderController extends AutoDisposeFamilyAsyncNotifier<Order, String> {
  int _writes = 0;

  @override
  Future<Order> build(String arg) {
    ref.watch(authControllerProvider.select((s) => s.user?.id));
    final timer = Timer.periodic(ref.watch(requestPollIntervalProvider), (_) => _poll());
    ref.onDispose(timer.cancel);
    return ref.watch(marketplaceRepositoryProvider).order(arg);
  }

  Future<void> _poll() async {
    final current = state.valueOrNull;
    if (current == null || state.isLoading || current.isFinished || !_appInForeground()) return;
    final asOf = _writes;
    try {
      final fresh = await ref.read(marketplaceRepositoryProvider).order(arg);
      if (asOf != _writes) return;
      state = AsyncData(fresh);
      if (fresh.status != current.status) ref.invalidate(ordersProvider);
    } catch (_) {
      // Offline or a server hiccup: try again on the next tick.
    }
  }

  /// Runs one action. The error, if any, goes to the caller to show; the order on screen stays as it was.
  Future<void> run(Future<Order> Function(MarketplaceRepository repo) action) async {
    final updated = await action(ref.read(marketplaceRepositoryProvider));
    _writes++;
    state = AsyncData(updated);
    ref.invalidate(ordersProvider);
  }

  Future<void> refresh() async {
    final fresh = await AsyncValue.guard(() => ref.read(marketplaceRepositoryProvider).order(arg));
    _writes++;
    state = fresh;
  }
}

final orderProvider = AsyncNotifierProvider.autoDispose.family<OrderController, Order, String>(OrderController.new);
