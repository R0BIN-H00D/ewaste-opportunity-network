import 'package:dio/dio.dart';
import '../core/network/api_exception.dart';
import '../models/chat.dart';
import '../models/page_result.dart';
import 'api_client.dart';

/// Messages between two people about something they share. The always-working path: live delivery is a bonus on top (see
/// the real-time service), so a lost connection never stops a message from being sent or read.
class ChatRepository {
  ChatRepository(this._api);

  final ApiClient _api;
  Dio get _dio => _api.dio;

  Map<String, dynamic> _data(Response<dynamic> res) => ((res.data as Map)['data'] as Map).cast<String, dynamic>();

  /// Finds or starts the thread for a repair, order, donation, recycling request, refurbishment offer or listing.
  Future<Conversation> open(String contextType, String contextId) =>
      guard(() async => Conversation.fromJson(_data(await _dio.post<dynamic>('/chat/conversations', data: {'contextType': contextType, 'contextId': contextId}))));

  /// My conversations, newest activity first, with the total number of unread messages from the same answer.
  Future<({PageResult<Conversation> page, int unread})> conversations({int page = 1}) => guard(() async {
        final res = await _dio.get<dynamic>('/chat/conversations', queryParameters: {'page': page, 'limit': 20});
        final body = (res.data as Map).cast<String, dynamic>();
        final meta = body['meta'] is Map ? (body['meta'] as Map).cast<String, dynamic>() : const <String, dynamic>{};
        final items = [for (final raw in body['data'] as List) Conversation.fromJson((raw as Map).cast<String, dynamic>())];
        return (
          page: PageResult(
            items: items,
            page: (meta['page'] as num?)?.toInt() ?? page,
            pages: (meta['pages'] as num?)?.toInt() ?? 1,
            total: (meta['total'] as num?)?.toInt() ?? items.length,
          ),
          unread: (meta['unread'] as num?)?.toInt() ?? 0,
        );
      });

  Future<int> unread() => guard(() async => (_data(await _dio.get<dynamic>('/chat/unread-count'))['unread'] as num?)?.toInt() ?? 0);

  /// Oldest first. Pass [before], the `nextBefore` of the previous page, to go further back.
  Future<MessagePage> messages(String conversationId, {String? before, int limit = 30}) => guard(() async {
        final res = await _dio.get<dynamic>('/chat/conversations/$conversationId/messages', queryParameters: {'limit': limit, if (before != null) 'before': before});
        final body = (res.data as Map).cast<String, dynamic>();
        final meta = body['meta'] is Map ? (body['meta'] as Map).cast<String, dynamic>() : const <String, dynamic>{};
        return MessagePage(
          items: [for (final raw in body['data'] as List) ChatMessage.fromJson((raw as Map).cast<String, dynamic>())],
          hasMore: (meta['hasMore'] as bool?) ?? false,
          nextBefore: meta['nextBefore'] as String?,
        );
      });

  Future<ChatMessage> send(String conversationId, String text) =>
      guard(() async => ChatMessage.fromJson(_data(await _dio.post<dynamic>('/chat/conversations/$conversationId/messages', data: {'text': text.trim()}))));

  Future<void> markRead(String conversationId) => guard(() async {
        await _dio.put<dynamic>('/chat/conversations/$conversationId/read');
      });
}
