import 'dart:async';
import 'dart:convert';
import 'key_value_store.dart';

/// A saved answer from the server and when it was saved.
class CachedResponse {
  const CachedResponse({required this.at, required this.body});

  final DateTime at;
  final Object? body;
}

/// Keeps the last good answer of the read-only lists so the app can show something without a connection.
///
/// - Only paths in [canCache] are saved. Anything about a request in progress (addresses, handovers, orders, chats) is never saved.
/// - Every entry belongs to one signed-in person ([owner] is part of the key), and everything is wiped at sign-out.
/// - The number of entries and the size of one entry are capped; the least recently saved entries go first.
/// - It sits on the same secure storage as the refresh token, so it is encrypted on the phone.
class ResponseCache {
  ResponseCache(this._store, {this.maxEntries = 40, this.maxEntryChars = 200000, DateTime Function()? clock}) : _clock = clock ?? DateTime.now;

  final KeyValueStore _store;
  final int maxEntries;
  final int maxEntryChars;
  final DateTime Function() _clock;

  static const _indexKey = 'cache_index';

  // One write at a time, so two lists arriving together cannot overwrite each other's bookkeeping.
  Future<void> _queue = Future.value();

  static final _allowed = <RegExp>[
    RegExp(r'^/categories$'),
    RegExp(r'^/devices(/[^/]+)?$'),
    RegExp(r'^/donations$'),
    RegExp(r'^/marketplace(/[^/]+)?$'),
    RegExp(r'^/notifications$'),
    RegExp(r'^/orders$'),
    RegExp(r'^/recycling-centers(/[^/]+)?$'),
    RegExp(r'^/refurbishment/jobs$'),
    RegExp(r'^/refurbishment/opportunities$'),
    RegExp(r'^/students/(opportunities(/[^/]+)?|applications|certificates|experience)$'),
    RegExp(r'^/technicians(/[^/]+)?$'),
    RegExp(r'^/transactions(/summary)?$'),
    RegExp(r'^/users/me/profile$'),
    RegExp(r'^/verification/status$'),
  ];

  /// Whether answers for this path may be kept (a path like `/devices`, without the host or `/api`).
  static bool canCache(String path) {
    final p = path.startsWith('/') ? path : '/$path';
    return _allowed.any((r) => r.hasMatch(p));
  }

  /// The key for one request by one person: the same path with the same filters.
  static String keyFor({required String owner, required String path, Map<String, dynamic>? query}) {
    final p = path.startsWith('/') ? path : '/$path';
    final pairs = <String>[];
    (query ?? const {}).forEach((k, v) {
      if (v != null) pairs.add('$k=$v');
    });
    pairs.sort();
    return '$owner|$p|${pairs.join('&')}';
  }

  String _entryKey(String key) => 'cache_${base64Url.encode(utf8.encode(key))}';

  Future<List<Map<String, dynamic>>> _readIndex() async {
    final raw = await _store.read(_indexKey);
    if (raw == null) return [];
    try {
      return (jsonDecode(raw) as List).map((e) => (e as Map).cast<String, dynamic>()).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> _writeIndex(List<Map<String, dynamic>> index) => _store.write(_indexKey, jsonEncode(index));

  Future<T> _locked<T>(Future<T> Function() action) {
    final run = _queue.then((_) => action());
    _queue = run.then<void>((_) {}, onError: (_) {});
    return run;
  }

  /// Saves [body] (the decoded JSON). Silently does nothing if it cannot be written or is too big.
  Future<void> write(String key, Object? body) => _locked(() async {
        try {
          final text = jsonEncode({'at': _clock().toUtc().toIso8601String(), 'body': body});
          if (text.length > maxEntryChars) return;
          final index = await _readIndex();
          index.removeWhere((e) => e['k'] == key);
          index.add({'k': key});
          while (index.length > maxEntries) {
            final oldest = index.removeAt(0);
            await _store.delete(_entryKey(oldest['k'] as String));
          }
          await _store.write(_entryKey(key), text);
          await _writeIndex(index);
        } catch (_) {
          // The cache is a convenience; never let it break a request.
        }
      });

  Future<CachedResponse?> read(String key) async {
    try {
      final raw = await _store.read(_entryKey(key));
      if (raw == null) return null;
      final map = (jsonDecode(raw) as Map).cast<String, dynamic>();
      return CachedResponse(at: DateTime.parse(map['at'] as String), body: map['body']);
    } catch (_) {
      return null;
    }
  }

  /// Removes everything (at sign-out).
  Future<void> clear() => _locked(() async {
        try {
          final index = await _readIndex();
          for (final e in index) {
            await _store.delete(_entryKey(e['k'] as String));
          }
          await _store.delete(_indexKey);
        } catch (_) {
          // Nothing more to do.
        }
      });
}
