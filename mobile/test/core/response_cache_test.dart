import 'dart:convert';
import 'package:ewaste_opportunity/core/format.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/storage/response_cache.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('what may be saved', () {
    test('lists and public pages can be saved', () {
      for (final path in [
        '/devices',
        '/devices/abc123',
        '/marketplace',
        '/marketplace/mine',
        '/marketplace/p1',
        '/technicians',
        '/technicians/t1',
        '/recycling-centers',
        '/recycling-centers/c1',
        '/students/opportunities',
        '/students/opportunities/o1',
        '/students/opportunities/mine',
        '/students/applications',
        '/students/certificates',
        '/students/experience',
        '/notifications',
        '/categories',
        '/refurbishment/jobs',
        '/refurbishment/opportunities',
        '/transactions',
        '/transactions/summary',
        '/users/me/profile',
        '/verification/status',
        'devices',
      ]) {
        expect(ResponseCache.canCache(path), isTrue, reason: path);
      }
    });

    test('anything about a request in progress, sign-in or money is never saved', () {
      for (final path in [
        '/service-requests',
        '/service-requests/r1',
        '/recycling-requests/r1',
        '/donations/d1',
        '/donations/d1/confirmation',
        '/orders/o1',
        '/refurbishment/jobs/j1',
        '/students/applications/a1',
        '/auth/me',
        '/auth/refresh',
        '/notifications/unread-count',
        '/devices/abc/photos/x',
        '/admin/users',
      ]) {
        expect(ResponseCache.canCache(path), isFalse, reason: path);
      }
    });
  });

  group('keys', () {
    test('the same filters in any order give the same key', () {
      final a = ResponseCache.keyFor(owner: 'u1', path: '/devices', query: {'page': 1, 'status': 'active'});
      final b = ResponseCache.keyFor(owner: 'u1', path: 'devices', query: {'status': 'active', 'page': 1});
      expect(a, b);
    });

    test('another person, path or filter gives another key', () {
      final base = ResponseCache.keyFor(owner: 'u1', path: '/devices', query: {'page': 1});
      expect(ResponseCache.keyFor(owner: 'u2', path: '/devices', query: {'page': 1}), isNot(base));
      expect(ResponseCache.keyFor(owner: 'u1', path: '/technicians', query: {'page': 1}), isNot(base));
      expect(ResponseCache.keyFor(owner: 'u1', path: '/devices', query: {'page': 2}), isNot(base));
    });

    test('empty filters are left out', () {
      expect(ResponseCache.keyFor(owner: 'u1', path: '/devices', query: {'q': null}), ResponseCache.keyFor(owner: 'u1', path: '/devices'));
    });
  });

  group('saving and reading', () {
    late MemoryKeyValueStore store;
    final t0 = DateTime.utc(2026, 11, 16, 9, 30);

    setUp(() => store = MemoryKeyValueStore());

    test('what was saved comes back with the time it was saved', () async {
      final cache = ResponseCache(store, clock: () => t0);
      await cache.write('k1', {'success': true, 'data': [1, 2, 3]});
      final got = await cache.read('k1');
      expect(got, isNotNull);
      expect(got!.at, t0);
      expect(got.body, {'success': true, 'data': [1, 2, 3]});
    });

    test('nothing saved means null', () async {
      expect(await ResponseCache(store).read('nope'), isNull);
    });

    test('saving again replaces the old answer', () async {
      final cache = ResponseCache(store);
      await cache.write('k', {'v': 1});
      await cache.write('k', {'v': 2});
      expect((await cache.read('k'))!.body, {'v': 2});
    });

    test('an answer that is too big is not saved', () async {
      final cache = ResponseCache(store, maxEntryChars: 50);
      await cache.write('big', {'text': 'x' * 100});
      expect(await cache.read('big'), isNull);
    });

    test('the oldest entries go first when there are too many', () async {
      final cache = ResponseCache(store, maxEntries: 3);
      for (final k in ['a', 'b', 'c', 'd']) {
        await cache.write(k, {'k': k});
      }
      expect(await cache.read('a'), isNull);
      for (final k in ['b', 'c', 'd']) {
        expect((await cache.read(k))!.body, {'k': k});
      }
    });

    test('saving an entry again makes it the newest', () async {
      final cache = ResponseCache(store, maxEntries: 2);
      await cache.write('a', {'k': 'a'});
      await cache.write('b', {'k': 'b'});
      await cache.write('a', {'k': 'a2'});
      await cache.write('c', {'k': 'c'});
      expect(await cache.read('b'), isNull);
      expect((await cache.read('a'))!.body, {'k': 'a2'});
    });

    test('writes that arrive together do not lose each other', () async {
      final cache = ResponseCache(store);
      await Future.wait([for (var i = 0; i < 10; i++) cache.write('k$i', {'i': i})]);
      for (var i = 0; i < 10; i++) {
        expect((await cache.read('k$i'))!.body, {'i': i});
      }
    });

    test('clear removes everything', () async {
      final cache = ResponseCache(store);
      await cache.write('a', {'x': 1});
      await cache.write('b', {'x': 2});
      await cache.clear();
      expect(await cache.read('a'), isNull);
      expect(await cache.read('b'), isNull);
      expect(await store.read('cache_index'), isNull);
    });

    test('a damaged entry reads as nothing instead of failing', () async {
      final cache = ResponseCache(store);
      await cache.write('a', {'x': 1});
      await store.write('cache_${base64Url.encode(utf8.encode('a'))}', '{broken');
      expect(await cache.read('a'), isNull);
    });
  });

  group('the saved-at label', () {
    final now = DateTime(2026, 11, 16, 20, 40);

    test('today shows only the time', () {
      expect(formatSavedAt(DateTime(2026, 11, 16, 15, 5), now: now), '3:05 PM');
      expect(formatSavedAt(DateTime(2026, 11, 16, 0, 7), now: now), '12:07 AM');
      expect(formatSavedAt(DateTime(2026, 11, 16, 12, 0), now: now), '12:00 PM');
    });

    test('another day shows the date and the time', () {
      expect(formatSavedAt(DateTime(2026, 11, 15, 15, 5), now: now), '15 Nov 2026, 3:05 PM');
    });
  });
}
