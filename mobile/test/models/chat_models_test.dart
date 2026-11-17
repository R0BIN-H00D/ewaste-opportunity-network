import 'package:ewaste_opportunity/core/format.dart';
import 'package:ewaste_opportunity/models/chat.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Conversation.fromJson', () {
    final json = {
      '_id': 'c1',
      'contextType': 'service',
      'contextId': 'r9',
      'other': {'_id': 'u2', 'name': 'Ravi Kumar', 'role': 'technician'},
      'lastMessage': {'text': 'See you at 5', 'at': '2026-11-16T09:30:00.000Z', 'mine': true},
      'unread': 3,
      'updatedAt': '2026-11-16T09:30:00.000Z',
    };

    test('reads who it is with, what it is about, the newest message and the unread count', () {
      final c = Conversation.fromJson(json);
      expect(c, isA<Conversation>());
      expect([c.id, c.contextType, c.contextId, c.otherId, c.otherName, c.otherRole], ['c1', 'service', 'r9', 'u2', 'Ravi Kumar', 'technician']);
      expect([c.lastText, c.lastMine, c.unread], ['See you at 5', true, 3]);
      expect(c.lastAt, isNotNull);
      expect(c.contextLabel, 'Repair');
    });

    test('a thread nobody has written in has no last message and zero unread', () {
      final c = Conversation.fromJson({...json, 'lastMessage': null, 'unread': null});
      expect([c.lastText, c.lastAt, c.lastMine, c.unread], [null, null, false, 0]);
    });

    test('a missing or blank name becomes "Someone" rather than an empty title', () {
      expect(Conversation.fromJson({...json, 'other': {'_id': 'u2'}}).otherName, 'Someone');
      expect(Conversation.fromJson({...json, 'other': {'_id': 'u2', 'name': '  '}}).otherName, 'Someone');
    });

    test('copyWith changes only what it is given', () {
      final c = Conversation.fromJson(json).copyWith(unread: 0, lastText: 'Thanks');
      expect([c.unread, c.lastText, c.otherName], [0, 'Thanks', 'Ravi Kumar']);
    });

    test('every kind of conversation has a readable label', () {
      expect({for (final t in chatContextLabels.keys) t: chatContextLabel(t)}.values.every((l) => l.isNotEmpty), isTrue);
      expect(chatContextLabel('order'), 'Order');
      expect(chatContextLabel('enquiry'), 'Question about a device');
      expect(chatContextLabel('something new'), 'Conversation');
    });
  });

  group('ChatMessage.fromJson', () {
    test('reads the text, sender, time and whether the other person has read it', () {
      final m = ChatMessage.fromJson({'_id': 'm1', 'conversation': 'c1', 'sender': 'u1', 'text': 'Hello', 'createdAt': '2026-11-16T09:30:00.000Z', 'read': true});
      expect([m.id, m.conversationId, m.senderId, m.text, m.read, m.pending, m.failed], ['m1', 'c1', 'u1', 'Hello', true, false, false]);
    });

    test('missing fields do not crash', () {
      final m = ChatMessage.fromJson({'_id': 'm2'});
      expect([m.text, m.senderId, m.read], ['', '', false]);
    });

    test('copyWith marks a message failed without changing the rest', () {
      final m = ChatMessage.fromJson({'_id': 'm1', 'sender': 'u1', 'text': 'Hi'}).copyWith(pending: false, failed: true);
      expect([m.text, m.failed, m.pending], ['Hi', true, false]);
    });
  });

  group('formatChatTime', () {
    final now = DateTime(2026, 11, 16, 15, 0);

    test('today is a time of day', () {
      expect(formatChatTime(DateTime(2026, 11, 16, 9, 5), now: now), '9:05 AM');
      expect(formatChatTime(DateTime(2026, 11, 16, 0, 30), now: now), '12:30 AM');
      expect(formatChatTime(DateTime(2026, 11, 16, 15, 45), now: now), '3:45 PM');
    });

    test('yesterday, earlier this year and earlier years each read differently', () {
      expect(formatChatTime(DateTime(2026, 11, 15, 23, 59), now: now), 'Yesterday');
      expect(formatChatTime(DateTime(2026, 3, 2), now: now), '2 Mar');
      expect(formatChatTime(DateTime(2025, 12, 31), now: now), '31 Dec 2025');
      expect(formatChatTime(null, now: now), '');
    });

    test('"yesterday" goes by the calendar day, not 24 hours', () {
      expect(formatChatTime(DateTime(2026, 11, 15, 1, 0), now: DateTime(2026, 11, 16, 0, 10)), 'Yesterday');
    });
  });
}
