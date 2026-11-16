import 'dart:io' show SocketException;
import 'package:dio/dio.dart';

/// What went wrong, in terms the screens can act on.
enum ApiFailure { network, timeout, unauthorized, forbidden, notFound, conflict, validation, rateLimited, server, cancelled, unknown }

const _offlineMessage = 'Cannot reach the server. Check your internet connection and try again.';
const _timeoutMessage = 'The server took too long to answer. Please try again.';
const _serverMessage = 'Something went wrong on our side. Please try again in a moment.';
const _genericMessage = 'Something went wrong. Please try again.';
const _unexpectedMessage = 'We received an unexpected answer from the server. Please try again.';

/// The one error type the app's screens deal with. Dio errors, bad JSON and the server's error envelope
/// (`{success:false, message, code, errors:[{field,message}]}`) are all turned into this by [ApiException.from].
class ApiException implements Exception {
  const ApiException(
    this.message, {
    this.failure = ApiFailure.unknown,
    this.statusCode,
    this.code,
    this.fieldErrors = const {},
  });

  /// Plain words for the person using the app.
  final String message;
  final ApiFailure failure;
  final int? statusCode;

  /// The server's machine code, for example `ACCOUNT_LOCKED` or `EMAIL_TAKEN`.
  final String? code;

  /// Field name to message, for validation errors (the server's `body.` prefix is removed).
  final Map<String, String> fieldErrors;

  /// True when the device or the connection is the problem, so retrying later is the right advice.
  bool get isNetwork => failure == ApiFailure.network || failure == ApiFailure.timeout;

  static const offline = ApiException(_offlineMessage, failure: ApiFailure.network);

  static ApiException from(Object error) {
    if (error is ApiException) return error;
    if (error is DioException) return _fromDio(error);
    if (error is FormatException || error is TypeError) {
      return const ApiException(_unexpectedMessage, failure: ApiFailure.server);
    }
    return const ApiException(_genericMessage);
  }

  static ApiException _fromDio(DioException e) {
    final type = e.type;
    if (type == DioExceptionType.connectionTimeout || type == DioExceptionType.sendTimeout || type == DioExceptionType.receiveTimeout) {
      return const ApiException(_timeoutMessage, failure: ApiFailure.timeout);
    }
    if (type == DioExceptionType.connectionError || e.error is SocketException) return offline;
    if (type == DioExceptionType.cancel) return const ApiException('The request was cancelled.', failure: ApiFailure.cancelled);

    final response = e.response;
    if (response == null) return const ApiException(_genericMessage);

    final status = response.statusCode;
    final data = response.data;
    final body = data is Map ? data : null;
    final failure = _failureFor(status);
    final serverText = body?['message'];
    final code = body?['code'];

    final fields = <String, String>{};
    final errors = body?['errors'];
    if (errors is List) {
      for (final item in errors) {
        if (item is! Map) continue;
        final field = item['field'];
        final text = item['message'];
        if (field is String && text is String) {
          fields.putIfAbsent(field.startsWith('body.') ? field.substring(5) : field, () => text);
        }
      }
    }

    // Never show a raw server error to a person; client errors carry a message written for them.
    final message = failure == ApiFailure.server
        ? _serverMessage
        : (serverText is String && serverText.isNotEmpty ? serverText : _defaultFor(failure));
    return ApiException(message, failure: failure, statusCode: status, code: code is String ? code : null, fieldErrors: fields);
  }

  static ApiFailure _failureFor(int? status) {
    if (status == null) return ApiFailure.unknown;
    if (status >= 500) return ApiFailure.server;
    switch (status) {
      case 401:
        return ApiFailure.unauthorized;
      case 403:
        return ApiFailure.forbidden;
      case 404:
        return ApiFailure.notFound;
      case 409:
        return ApiFailure.conflict;
      case 400:
      case 422:
        return ApiFailure.validation;
      case 429:
        return ApiFailure.rateLimited;
      default:
        return ApiFailure.unknown;
    }
  }

  static String _defaultFor(ApiFailure failure) {
    switch (failure) {
      case ApiFailure.unauthorized:
        return 'Please sign in again.';
      case ApiFailure.forbidden:
        return 'You do not have access to this.';
      case ApiFailure.notFound:
        return 'We could not find that.';
      case ApiFailure.conflict:
        return 'That conflicts with something that already exists.';
      case ApiFailure.validation:
        return 'Please check what you entered and try again.';
      case ApiFailure.rateLimited:
        return 'Too many attempts. Please wait a little and try again.';
      case ApiFailure.network:
        return _offlineMessage;
      case ApiFailure.timeout:
        return _timeoutMessage;
      case ApiFailure.server:
        return _serverMessage;
      case ApiFailure.cancelled:
      case ApiFailure.unknown:
        return _genericMessage;
    }
  }

  @override
  String toString() => 'ApiException($failure${statusCode == null ? '' : ' $statusCode'}${code == null ? '' : ' $code'}): $message';
}

/// Runs a network action and turns anything that goes wrong into an [ApiException].
/// Programming errors (anything other than Dio, bad JSON or a wrong type in a response) are not hidden.
Future<T> guard<T>(Future<T> Function() action) async {
  try {
    return await action();
  } on ApiException {
    rethrow;
  } on DioException catch (e) {
    throw ApiException.from(e);
  } on FormatException catch (e) {
    throw ApiException.from(e);
  } on TypeError catch (e) {
    throw ApiException.from(e);
  }
}
