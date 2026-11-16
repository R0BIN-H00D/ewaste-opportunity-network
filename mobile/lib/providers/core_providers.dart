import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/storage/key_value_store.dart';
import '../core/storage/response_cache.dart';
import '../services/api_client.dart';
import '../services/auth_repository.dart';

/// Secure storage on the device. Tests override this with an in-memory store.
final keyValueStoreProvider = Provider<KeyValueStore>((ref) => SecureKeyValueStore());

/// When the list on screen was last answered from saved data because the server could not be reached; null while the server answers.
final savedDataSinceProvider = StateProvider<DateTime?>((ref) => null);

final apiClientProvider = Provider<ApiClient>((ref) {
  final store = ref.watch(keyValueStoreProvider);
  final client = ApiClient(store: store, cache: ResponseCache(store));
  client.onServedFromCache = (at) => ref.read(savedDataSinceProvider.notifier).state = at;
  client.onFreshData = () {
    final notifier = ref.read(savedDataSinceProvider.notifier);
    if (notifier.state != null) notifier.state = null;
  };
  return client;
});

final dioProvider = Provider<Dio>((ref) => ref.watch(apiClientProvider).dio);

final authRepositoryProvider = Provider<AuthRepository>((ref) => AuthRepository(ref.watch(apiClientProvider)));

/// Resolves to the backend health payload, or throws if unreachable.
final healthProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final res = await ref.watch(dioProvider).get('/health');
  return (res.data['data'] as Map).cast<String, dynamic>();
});
