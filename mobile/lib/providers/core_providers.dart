import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/storage/key_value_store.dart';
import '../services/api_client.dart';
import '../services/auth_repository.dart';

/// Secure storage on the device. Tests override this with an in-memory store.
final keyValueStoreProvider = Provider<KeyValueStore>((ref) => SecureKeyValueStore());

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient(store: ref.watch(keyValueStoreProvider)));

final dioProvider = Provider<Dio>((ref) => ref.watch(apiClientProvider).dio);

final authRepositoryProvider = Provider<AuthRepository>((ref) => AuthRepository(ref.watch(apiClientProvider)));

/// Resolves to the backend health payload, or throws if unreachable.
final healthProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final res = await ref.watch(dioProvider).get('/health');
  return (res.data['data'] as Map).cast<String, dynamic>();
});
