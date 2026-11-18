import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/services/api_client.dart';
import 'package:ewaste_opportunity/services/wanted_repository.dart';
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

ResponseBody _json(int status, Object body) => ResponseBody.fromString(jsonEncode(body), status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType]
    });

({WantedRepository repo, _Adapter api}) _rig(Future<ResponseBody> Function(RequestOptions) handler) {
  final adapter = _Adapter(handler);
  final client = ApiClient(
    store: MemoryKeyValueStore(),
    dio: Dio(BaseOptions(baseUrl: 'http://test/api'))..httpClientAdapter = adapter,
    refreshDio: Dio(BaseOptions(baseUrl: 'http://test/api'))..httpClientAdapter = _Adapter((_) async => _json(500, {})),
  );
  return (repo: WantedRepository(client), api: adapter);
}

Map<String, dynamic> wantedJson({String id = 'w1', String title = 'Used laptops', String status = 'open', bool responded = false, int count = 0}) => {
      '_id': id,
      'title': title,
      'quantity': 3,
      'status': status,
      'minCondition': 'minor_damage',
      'city': 'Bengaluru',
      'category': {'name': 'Laptops', 'slug': 'laptops'},
      'refurbisher': {'name': 'Green Tech'},
      'hasResponded': responded,
      'responseCount': count,
    };

void main() {
  test('the board asks for open requests from everyone and reads them', () async {
    final rig = _rig((o) async => _json(200, {
          'success': true,
          'data': [wantedJson(), wantedJson(id: 'w2', title: 'Tablets', responded: true)]
        }));
    final items = await rig.repo.board();
    expect(rig.api.requests.single.path, '/wanted-requests');
    expect(rig.api.requests.single.queryParameters['as'], 'board');
    expect(items.map((w) => w.title), ['Used laptops', 'Tablets']);
    expect(items.first.refurbisherName, 'Green Tech');
    expect(items.first.categoryName, 'Laptops');
    expect(items.first.quantity, 3);
    expect(items.last.hasResponded, isTrue);
  });

  test('my requests carry the number of people who accepted', () async {
    final rig = _rig((o) async => _json(200, {
          'success': true,
          'data': [wantedJson(count: 2, status: 'closed')]
        }));
    final items = await rig.repo.mine();
    expect(rig.api.requests.single.queryParameters['as'], 'mine');
    expect(items.single.responseCount, 2);
    expect(items.single.isOpen, isFalse);
  });

  test('a new request sends only what was filled in', () async {
    final rig = _rig((o) async => _json(201, {'success': true, 'data': wantedJson()}));
    await rig.repo.create(title: '  Used laptops ', brand: '', minCondition: 'minor_damage', quantity: 3, city: ' Pune ', notes: '');
    final sent = rig.api.requests.single;
    expect(sent.method, 'POST');
    expect(sent.path, '/wanted-requests');
    expect(sent.data, {'title': 'Used laptops', 'quantity': 3, 'minCondition': 'minor_damage', 'city': 'Pune'});
  });

  test('accepting sends the optional message, closing and deleting use the right calls', () async {
    final rig = _rig((o) async => _json(200, {'success': true, 'data': null}));
    await rig.repo.respond('w1', message: ' I have two ');
    await rig.repo.respond('w2');
    await rig.repo.setStatus('w1', 'closed');
    await rig.repo.delete('w1');
    final calls = rig.api.requests;
    expect([calls[0].method, calls[0].path, calls[0].data], ['POST', '/wanted-requests/w1/respond', {'message': 'I have two'}]);
    expect(calls[1].data, <String, dynamic>{});
    expect([calls[2].method, calls[2].path, calls[2].data], ['PUT', '/wanted-requests/w1/status', {'status': 'closed'}]);
    expect([calls[3].method, calls[3].path], ['DELETE', '/wanted-requests/w1']);
  });

  test('the people who accepted are read with their role and message', () async {
    final rig = _rig((o) async => _json(200, {
          'success': true,
          'data': [
            {'_id': 'r1', 'responder': {'name': 'Meera', 'role': 'user'}, 'message': 'I have two'},
            {'_id': 'r2', 'responder': {'name': 'Arjun', 'role': 'technician'}}
          ]
        }));
    final who = await rig.repo.responses('w1');
    expect(rig.api.requests.single.path, '/wanted-requests/w1/responses');
    expect(who.map((r) => r.name), ['Meera', 'Arjun']);
    expect(who.first.message, 'I have two');
    expect(who.last.role, 'technician');
  });
}
