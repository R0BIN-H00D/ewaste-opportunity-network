import 'dart:io';
import 'package:dio/dio.dart';
import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:flutter_test/flutter_test.dart';

DioException _response(int status, Object? data) {
  final request = RequestOptions(path: '/x');
  return DioException(
    requestOptions: request,
    type: DioExceptionType.badResponse,
    response: Response<dynamic>(requestOptions: request, statusCode: status, data: data),
  );
}

void main() {
  group('ApiException.from', () {
    test('uses the server message and code for client errors', () {
      final e = ApiException.from(_response(409, {'success': false, 'message': 'That email is already registered', 'code': 'EMAIL_TAKEN'}));
      expect(e.failure, ApiFailure.conflict);
      expect(e.statusCode, 409);
      expect(e.code, 'EMAIL_TAKEN');
      expect(e.message, 'That email is already registered');
    });

    test('collects field errors and removes the body. prefix', () {
      final e = ApiException.from(_response(422, {
        'message': 'Validation failed',
        'code': 'VALIDATION_ERROR',
        'errors': [
          {'field': 'body.email', 'message': 'Enter a valid email'},
          {'field': 'body.password', 'message': 'Too short'},
          {'field': 'body.email', 'message': 'Second message is ignored'},
        ],
      }));
      expect(e.failure, ApiFailure.validation);
      expect(e.fieldErrors, {'email': 'Enter a valid email', 'password': 'Too short'});
    });

    test('never shows a raw server error message', () {
      final e = ApiException.from(_response(500, {'message': 'MongoServerError: E11000 duplicate key'}));
      expect(e.failure, ApiFailure.server);
      expect(e.message, isNot(contains('Mongo')));
    });

    test('maps the other status codes', () {
      expect(ApiException.from(_response(401, null)).failure, ApiFailure.unauthorized);
      expect(ApiException.from(_response(403, null)).failure, ApiFailure.forbidden);
      expect(ApiException.from(_response(404, null)).failure, ApiFailure.notFound);
      expect(ApiException.from(_response(429, null)).failure, ApiFailure.rateLimited);
      expect(ApiException.from(_response(400, null)).failure, ApiFailure.validation);
      expect(ApiException.from(_response(503, null)).failure, ApiFailure.server);
    });

    test('falls back to a readable message when the body is not JSON', () {
      final e = ApiException.from(_response(404, '<html>Not found</html>'));
      expect(e.message, isNotEmpty);
      expect(e.message, isNot(contains('<html>')));
    });

    test('connection problems are offline and timeouts are timeouts', () {
      final request = RequestOptions(path: '/x');
      final offline = ApiException.from(DioException(requestOptions: request, type: DioExceptionType.connectionError, error: const SocketException('no route')));
      expect(offline.failure, ApiFailure.network);
      expect(offline.isNetwork, isTrue);

      final slow = ApiException.from(DioException(requestOptions: request, type: DioExceptionType.receiveTimeout));
      expect(slow.failure, ApiFailure.timeout);
      expect(slow.isNetwork, isTrue);
    });

    test('bad JSON becomes a friendly error and other errors become unknown', () {
      expect(ApiException.from(const FormatException('bad')).failure, ApiFailure.server);
      expect(ApiException.from(StateError('boom')).failure, ApiFailure.unknown);
    });

    test('passes an ApiException through unchanged', () {
      expect(ApiException.from(ApiException.offline), same(ApiException.offline));
    });
  });

  group('guard', () {
    test('returns the value', () async {
      expect(await guard(() async => 42), 42);
    });

    test('turns a DioException into an ApiException', () async {
      await expectLater(guard<void>(() async => throw _response(401, null)), throwsA(isA<ApiException>()));
    });

    test('does not hide programming errors', () async {
      await expectLater(guard<void>(() async => throw StateError('bug')), throwsA(isA<StateError>()));
    });
  });
}
