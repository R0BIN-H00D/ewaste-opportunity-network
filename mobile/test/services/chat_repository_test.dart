import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/services/api_client.dart';
import 'package:ewaste_opportunity/services/chat_repository.dart';
import 'package:flutter_test/flutter_test.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(this.handler);

  final Future<ResponseBody> Function(RequestOptions options) handler;
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) {
    requests.add(options);
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(int status, Object body) => ResponseBody.fromString(jsonEncode(body), status, headers: {Headers.contentTypeHeader: [Headers.jsonContentType]});

({ChatRepository repo, _Adapter api}) _rig(Future<ResponseBody> Function(RequestOptions) handler) {
  final adapter = _Adapter(handler);
  final client = ApiClient(
    store: MemoryKeyValueStore(),
    dio: Dio(BaseOptions(baseUrl: 'http://test/api'))..httpClientAdapter = adapter,
    refreshDio: Dio(BaseOptions(baseUrl: 'http://test/api'))..httpClientAdapter = _Adapter((_) async => _json(500, {})),
  );
  return (repo: ChatRepository(client), api: adapter);
}

Map<String, dynamic> _convo(String id) => {
      '_id': id,
      'contextType': 'order',
      'contextId': 'o1',
      'other': {'_id': 'u2', 'name': 'Meena', 'role': 'refurbisher'},
      'lastMessage': null,
      'unread': 0,
    };

void main() {
  test('open asks for the thread by what it is about and returns it', () async {
    final rig = _rig((_) async => _json(200, {'success': true, 'data': _convo('c1')}));
    final c = await rig.repo.open('order', 'o1');

    expect(c.id, 'c1');
    expect(c.otherName, 'Meena');
    final sent = rig.api.requests.single;
    expect([sent.method, sent.path], ['POST', '/chat/conversations']);
    expect(sent.data, {'contextType': 'order', 'contextId': 'o1'});
  });

  test('open turns the server\'s refusal into an error with its message', () async {
    final rig = _rig((_) async => _json(404, {'success': false, 'message': 'There is nobody to message here', 'code': 'NOT_FOUND'}));
    await expectLater(
      rig.repo.open('service', 'r1'),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', 'There is nobody to message here').having((e) => e.statusCode, 'status', 404)),
    );
  });

  test('conversations returns the page and the unread total from the same answer', () async {
    final rig = _rig((_) async => _json(200, {
          'success': true,
          'data': [_convo('c1'), _convo('c2')],
          'meta': {'page': 1, 'pages': 3, 'total': 41, 'unread': 7},
        }));
    final result = await rig.repo.conversations(page: 2);

    expect(result.page.items.map((c) => c.id), ['c1', 'c2']);
    expect([result.page.page, result.page.pages, result.page.total, result.unread], [1, 3, 41, 7]);
    expect(rig.api.requests.single.queryParameters, {'page': 2, 'limit': 20});
  });

  test('messages pages backwards with `before` and reports whether there is more', () async {
    final rig = _rig((_) async => _json(200, {
          'success': true,
          'data': [
            {'_id': 'm1', 'conversation': 'c1', 'sender': 'u2', 'text': 'Hi', 'createdAt': '2026-11-16T09:00:00.000Z', 'read': false},
            {'_id': 'm2', 'conversation': 'c1', 'sender': 'u1', 'text': 'Hello', 'createdAt': '2026-11-16T09:01:00.000Z', 'read': true},
          ],
          'meta': {'hasMore': true, 'nextBefore': 'm1'},
        }));
    final page = await rig.repo.messages('c1', before: 'm9', limit: 2);

    expect(page.items.map((m) => m.text), ['Hi', 'Hello']);
    expect([page.hasMore, page.nextBefore], [true, 'm1']);
    final sent = rig.api.requests.single;
    expect(sent.path, '/chat/conversations/c1/messages');
    expect(sent.queryParameters, {'limit': 2, 'before': 'm9'});
  });

  test('the first page of messages sends no `before`', () async {
    final rig = _rig((_) async => _json(200, {'success': true, 'data': [], 'meta': {'hasMore': false, 'nextBefore': null}}));
    await rig.repo.messages('c1');
    expect(rig.api.requests.single.queryParameters.containsKey('before'), isFalse);
  });

  test('send posts trimmed text and returns the saved message', () async {
    final rig = _rig((_) async => _json(201, {
          'success': true,
          'data': {'_id': 'm5', 'conversation': 'c1', 'sender': 'u1', 'text': 'On my way', 'createdAt': '2026-11-16T09:00:00.000Z', 'read': false},
        }));
    final m = await rig.repo.send('c1', '  On my way  ');

    expect([m.id, m.text], ['m5', 'On my way']);
    final sent = rig.api.requests.single;
    expect([sent.method, sent.path, sent.data], ['POST', '/chat/conversations/c1/messages', {'text': 'On my way'}]);
  });

  test('markRead puts to the read endpoint, and unread reads the count', () async {
    final rig = _rig((o) async => _json(200, {'success': true, 'data': o.path.endsWith('/unread-count') ? {'unread': 4} : {'unread': 0}}));
    await rig.repo.markRead('c1');
    expect(await rig.repo.unread(), 4);

    expect([rig.api.requests[0].method, rig.api.requests[0].path], ['PUT', '/chat/conversations/c1/read']);
    expect(rig.api.requests[1].path, '/chat/unread-count');
  });
}
