import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../models/account.dart';
import '../models/chat.dart';
import 'api_client.dart';

/// A message arrived (from the other person, or sent from another of my devices), with my view of its conversation.
class MessageEvent {
  const MessageEvent({required this.message, required this.conversation});

  final ChatMessage message;
  final Conversation conversation;
}

/// Somebody read a thread. [byUserId] is who: if it is the other person, my messages in it are now "seen".
class ReadEvent {
  const ReadEvent({required this.conversationId, required this.byUserId});

  final String conversationId;
  final String byUserId;
}

class TypingEvent {
  const TypingEvent({required this.conversationId, required this.userId, required this.typing});

  final String conversationId;
  final String userId;
  final bool typing;
}

/// A notification the server has just created for me, with how many are unread now.
class NotificationPush {
  const NotificationPush({required this.notification, required this.unread});

  final NotificationItem notification;
  final int unread;
}

/// The live channel to the server. Everything it delivers can also be fetched over the normal API, so when it is down the
/// app still works; it just learns about things when a screen refreshes instead of at once.
abstract class RealtimeService {
  Stream<MessageEvent> get messages;
  Stream<ReadEvent> get reads;
  Stream<TypingEvent> get typing;
  Stream<NotificationPush> get notifications;

  /// True while connected.
  Stream<bool> get connection;
  bool get isConnected;

  void connect();

  /// Tells the other person I am (or am no longer) typing. Best effort: dropped when not connected.
  void sendTyping(String conversationId, bool typing);

  void dispose();
}

/// Used when nobody is signed in, and by tests that do not care about live events.
class NoRealtime implements RealtimeService {
  const NoRealtime();

  @override
  Stream<MessageEvent> get messages => const Stream.empty();
  @override
  Stream<ReadEvent> get reads => const Stream.empty();
  @override
  Stream<TypingEvent> get typing => const Stream.empty();
  @override
  Stream<NotificationPush> get notifications => const Stream.empty();
  @override
  Stream<bool> get connection => const Stream.empty();
  @override
  bool get isConnected => false;
  @override
  void connect() {}
  @override
  void sendTyping(String conversationId, bool typing) {}
  @override
  void dispose() {}
}

Map<String, dynamic> _map(Object? v) => v is Map ? v.cast<String, dynamic>() : const <String, dynamic>{};

/// Socket.IO on the same server as the API. Signs in with the access token; when the server says the token is stale
/// (they last a short while) it refreshes the session once and connects again with the new one.
class SocketRealtimeService implements RealtimeService {
  SocketRealtimeService({required ApiClient api, required String url, String? Function()? token})
      : _api = api,
        _url = url,
        _token = token ?? (() => api.accessToken);

  final ApiClient _api;
  final String _url;
  final String? Function() _token;

  io.Socket? _socket;
  bool _connected = false;
  bool _refreshing = false;
  bool _disposed = false;

  final _messages = StreamController<MessageEvent>.broadcast();
  final _reads = StreamController<ReadEvent>.broadcast();
  final _typing = StreamController<TypingEvent>.broadcast();
  final _notifications = StreamController<NotificationPush>.broadcast();
  final _connection = StreamController<bool>.broadcast();

  @override
  Stream<MessageEvent> get messages => _messages.stream;
  @override
  Stream<ReadEvent> get reads => _reads.stream;
  @override
  Stream<TypingEvent> get typing => _typing.stream;
  @override
  Stream<NotificationPush> get notifications => _notifications.stream;
  @override
  Stream<bool> get connection => _connection.stream;
  @override
  bool get isConnected => _connected;

  void _setConnected(bool value) {
    if (_connected == value || _disposed) return;
    _connected = value;
    _connection.add(value);
  }

  @override
  void connect() {
    if (_socket != null || _disposed) return;
    final token = _token();
    if (token == null) return;
    final socket = io.io(
      _url,
      io.OptionBuilder().setTransports(['websocket']).disableAutoConnect().enableReconnection().setReconnectionDelay(2000).setAuth({'token': token}).build(),
    );
    _socket = socket;

    socket.onConnect((_) => _setConnected(true));
    socket.onDisconnect((_) => _setConnected(false));
    socket.onConnectError((error) async {
      _setConnected(false);
      // "UNAUTHORIZED" is how the server says the token is missing, expired or revoked.
      if ('$error'.contains('UNAUTHORIZED')) await _renewToken(socket);
    });

    socket.on('message:new', (data) {
      final json = _map(data);
      if (json['message'] is! Map || json['conversation'] is! Map) return;
      _messages.add(MessageEvent(message: ChatMessage.fromJson(_map(json['message'])), conversation: Conversation.fromJson(_map(json['conversation']))));
    });
    socket.on('message:read', (data) {
      final json = _map(data);
      _reads.add(ReadEvent(conversationId: (json['conversationId'] as String?) ?? '', byUserId: (json['by'] as String?) ?? ''));
    });
    socket.on('typing', (data) {
      final json = _map(data);
      _typing.add(TypingEvent(conversationId: (json['conversationId'] as String?) ?? '', userId: (json['userId'] as String?) ?? '', typing: json['typing'] == true));
    });
    socket.on('notification:new', (data) {
      final json = _map(data);
      if (json['notification'] is! Map) return;
      _notifications.add(NotificationPush(notification: NotificationItem.fromJson(_map(json['notification'])), unread: (json['unread'] as num?)?.toInt() ?? 0));
    });

    socket.connect();
  }

  Future<void> _renewToken(io.Socket socket) async {
    if (_refreshing || _disposed) return;
    _refreshing = true;
    try {
      final outcome = await _api.refresh();
      final fresh = _token();
      if (outcome == RefreshOutcome.refreshed && fresh != null && !_disposed) {
        socket.auth = {'token': fresh};
        socket.connect();
      }
    } finally {
      _refreshing = false;
    }
  }

  @override
  void sendTyping(String conversationId, bool typing) {
    if (!_connected) return;
    _socket?.emit('typing', {'conversationId': conversationId, 'typing': typing});
  }

  @override
  void dispose() {
    _disposed = true;
    _socket?.dispose();
    _socket = null;
    for (final c in [_messages, _reads, _typing, _notifications, _connection]) {
      c.close();
    }
  }
}
