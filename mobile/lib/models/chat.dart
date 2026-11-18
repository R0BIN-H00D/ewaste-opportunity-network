DateTime? _date(Object? v) =>
    v is String ? DateTime.tryParse(v)?.toLocal() : null;

/// What a conversation is about, in words ("Repair", "Order"). The server decides who the two people are from this record.
const Map<String, String> chatContextLabels = {
  'service': 'Repair',
  'order': 'Order',
  'recycling': 'Recycling',
  'donation': 'Donation',
  'offer': 'Refurbishment offer',
  'enquiry': 'Question about a device',
  'wanted': 'Wanted device request',
};

String chatContextLabel(String type) =>
    chatContextLabels[type] ?? 'Conversation';

/// A thread between the signed-in person and one other person about something they share.
class Conversation {
  const Conversation({
    required this.id,
    required this.contextType,
    required this.contextId,
    required this.otherId,
    required this.otherName,
    this.otherRole = '',
    this.lastText,
    this.lastAt,
    this.lastMine = false,
    this.unread = 0,
    this.updatedAt,
  });

  final String id;
  final String contextType;
  final String contextId;
  final String otherId;
  final String otherName;
  final String otherRole;

  /// The newest message, or `null` for a thread nobody has written in yet.
  final String? lastText;
  final DateTime? lastAt;
  final bool lastMine;

  /// How many messages from the other person are waiting to be read.
  final int unread;
  final DateTime? updatedAt;

  String get contextLabel => chatContextLabel(contextType);

  Conversation copyWith(
          {String? lastText,
          DateTime? lastAt,
          bool? lastMine,
          int? unread,
          DateTime? updatedAt}) =>
      Conversation(
        id: id,
        contextType: contextType,
        contextId: contextId,
        otherId: otherId,
        otherName: otherName,
        otherRole: otherRole,
        lastText: lastText ?? this.lastText,
        lastAt: lastAt ?? this.lastAt,
        lastMine: lastMine ?? this.lastMine,
        unread: unread ?? this.unread,
        updatedAt: updatedAt ?? this.updatedAt,
      );

  factory Conversation.fromJson(Map<String, dynamic> json) {
    final other = json['other'] is Map
        ? (json['other'] as Map).cast<String, dynamic>()
        : const <String, dynamic>{};
    final last = json['lastMessage'] is Map
        ? (json['lastMessage'] as Map).cast<String, dynamic>()
        : null;
    return Conversation(
      id: json['_id'] as String,
      contextType: (json['contextType'] as String?) ?? '',
      contextId: (json['contextId'] as String?) ?? '',
      otherId: (other['_id'] as String?) ?? '',
      otherName: ((other['name'] as String?) ?? '').trim().isEmpty
          ? 'Someone'
          : other['name'] as String,
      otherRole: (other['role'] as String?) ?? '',
      lastText: last?['text'] as String?,
      lastAt: _date(last?['at']),
      lastMine: (last?['mine'] as bool?) ?? false,
      unread: (json['unread'] as num?)?.toInt() ?? 0,
      updatedAt: _date(json['updatedAt']),
    );
  }
}

/// One message. A message that has not reached the server yet has [pending] set and a temporary id; one that failed has [failed].
class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.conversationId,
    required this.senderId,
    required this.text,
    required this.createdAt,
    this.read = false,
    this.pending = false,
    this.failed = false,
  });

  final String id;
  final String conversationId;
  final String senderId;
  final String text;
  final DateTime createdAt;

  /// The other person has opened the thread since this was sent.
  final bool read;
  final bool pending;
  final bool failed;

  ChatMessage copyWith({bool? read, bool? pending, bool? failed}) =>
      ChatMessage(
        id: id,
        conversationId: conversationId,
        senderId: senderId,
        text: text,
        createdAt: createdAt,
        read: read ?? this.read,
        pending: pending ?? this.pending,
        failed: failed ?? this.failed,
      );

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
        id: json['_id'] as String,
        conversationId: (json['conversation'] as String?) ?? '',
        senderId: (json['sender'] as String?) ?? '',
        text: (json['text'] as String?) ?? '',
        createdAt: _date(json['createdAt']) ?? DateTime.now(),
        read: (json['read'] as bool?) ?? false,
      );
}

/// A page of messages, oldest first, and where to ask for the ones before it.
class MessagePage {
  const MessagePage(
      {required this.items, required this.hasMore, this.nextBefore});

  final List<ChatMessage> items;
  final bool hasMore;
  final String? nextBefore;
}
