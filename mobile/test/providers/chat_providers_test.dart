import 'dart:async';
import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/models/account.dart';
import 'package:ewaste_opportunity/models/chat.dart';
import 'package:ewaste_opportunity/providers/account_providers.dart';
import 'package:ewaste_opportunity/providers/auth_controller.dart';
import 'package:ewaste_opportunity/providers/chat_providers.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import '../fakes.dart';
import '../helpers.dart';

class _Rig {
  _Rig(this.container, this.repo, this.live, this.account);

  final ProviderContainer container;
  final FakeChatRepository repo;
  final FakeRealtime live;
  final FakeAccountRepository account;

  ChatThread get thread => container.read(chatThreadProvider('c1'));
  ChatThreadController get controller => container.read(chatThreadProvider('c1').notifier);
}

/// Signs `u1` in with fakes behind everything, and keeps the thread for `c1` open (it closes itself when nobody watches it).
Future<_Rig> _boot({List<ChatMessage> messages = const [], List<Conversation>? conversations}) async {
  final repo = FakeChatRepository()
    ..conversationList = conversations ?? [sampleConversation(lastText: 'hi', unread: 2)]
    ..thread['c1'] = [...messages];
  final live = FakeRealtime();
  final account = FakeAccountRepository();
  final container = ProviderContainer(
    overrides: [
      keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
      authRepositoryProvider.overrideWithValue(FakeAuthRepository(loginResult: sampleMe())),
      chatRepositoryProvider.overrideWithValue(repo),
      realtimeServiceProvider.overrideWithValue(live),
      accountRepositoryProvider.overrideWithValue(account),
    ],
  );
  addTearDown(container.dispose);
  await container.read(authControllerProvider.notifier).signIn(email: 'asha@example.com', password: 'x');
  container.listen(chatThreadProvider('c1'), (_, __) {});
  container.listen(conversationsProvider, (_, __) {});
  await pumpEventQueue();
  return _Rig(container, repo, live, account);
}

void main() {
  group('opening a thread', () {
    test('shows the newest messages oldest first and tells the server they were read', () async {
      final rig = await _boot(messages: [sampleMessage('m1', 'Hello'), sampleMessage('m2', 'Are you there?')]);

      expect(rig.thread.messages.map((m) => m.text), ['Hello', 'Are you there?']);
      expect(rig.thread.loading, isFalse);
      expect(rig.repo.marked, ['c1']);
      expect(rig.thread.messages.every((m) => m.read), isTrue, reason: 'the other person\'s messages count as read once opened');
      expect(rig.container.read(conversationsProvider).items.first.unread, 0);
    });

    test('does not bother the server when there is nothing new from the other person', () async {
      final rig = await _boot(messages: [sampleMessage('m1', 'Mine', sender: 'u1'), sampleMessage('m2', 'Theirs', read: true)]);
      expect(rig.repo.marked, isEmpty);
    });

    test('an empty thread is just empty, not an error', () async {
      final rig = await _boot();
      expect(rig.thread.messages, isEmpty);
      expect(rig.thread.error, isNull);
      expect(rig.thread.hasMore, isFalse);
    });

    test('a failed load shows the error and can be retried', () async {
      final repo = FakeChatRepository()..messagesError = const ApiException('Cannot reach the server', failure: ApiFailure.network);
      final live = FakeRealtime();
      final container = ProviderContainer(overrides: [
        keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository(loginResult: sampleMe())),
        chatRepositoryProvider.overrideWithValue(repo),
        realtimeServiceProvider.overrideWithValue(live),
        accountRepositoryProvider.overrideWithValue(FakeAccountRepository()),
      ]);
      addTearDown(container.dispose);
      await container.read(authControllerProvider.notifier).signIn(email: 'a@b.c', password: 'x');
      container.listen(chatThreadProvider('c1'), (_, __) {});
      await pumpEventQueue();
      expect(container.read(chatThreadProvider('c1')).error?.message, 'Cannot reach the server');

      repo
        ..messagesError = null
        ..thread['c1'] = [sampleMessage('m1', 'Back')];
      await container.read(chatThreadProvider('c1').notifier).load();
      expect(container.read(chatThreadProvider('c1')).error, isNull);
      expect(container.read(chatThreadProvider('c1')).messages.single.text, 'Back');
    });

    test('older messages are fetched on request and stop when there are no more', () async {
      final all = [for (var i = 1; i <= 7; i++) sampleMessage('m$i', 'msg $i', sender: i.isEven ? 'u1' : 'u2', read: true)];
      final repo = FakeChatRepository()
        ..pageSize = 3
        ..thread['c1'] = all;
      final live = FakeRealtime();
      final container = ProviderContainer(overrides: [
        keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository(loginResult: sampleMe())),
        chatRepositoryProvider.overrideWithValue(repo),
        realtimeServiceProvider.overrideWithValue(live),
        accountRepositoryProvider.overrideWithValue(FakeAccountRepository()),
      ]);
      addTearDown(container.dispose);
      await container.read(authControllerProvider.notifier).signIn(email: 'a@b.c', password: 'x');
      container.listen(chatThreadProvider('c1'), (_, __) {});
      await pumpEventQueue();

      final ctrl = container.read(chatThreadProvider('c1').notifier);
      expect(container.read(chatThreadProvider('c1')).messages.map((m) => m.text), ['msg 5', 'msg 6', 'msg 7']);
      expect(container.read(chatThreadProvider('c1')).hasMore, isTrue);

      await ctrl.loadOlder();
      expect(container.read(chatThreadProvider('c1')).messages.map((m) => m.text), ['msg 2', 'msg 3', 'msg 4', 'msg 5', 'msg 6', 'msg 7']);
      await ctrl.loadOlder();
      expect(container.read(chatThreadProvider('c1')).messages.first.text, 'msg 1');
      expect(container.read(chatThreadProvider('c1')).hasMore, isFalse);
      await ctrl.loadOlder(); // nothing further to ask for
      expect(container.read(chatThreadProvider('c1')).messages, hasLength(7));
    });
  });

  group('sending', () {
    test('shows the message at once as sending, then as the saved one', () async {
      final rig = await _boot();
      rig.repo.sendGate = Completer<void>();

      final sending = rig.controller.send('  On my way  ');
      expect(rig.thread.messages.single, isA<ChatMessage>().having((m) => m.pending, 'pending', true).having((m) => m.text, 'text', 'On my way'));

      rig.repo.sendGate!.complete();
      await sending;
      final m = rig.thread.messages.single;
      expect([m.pending, m.failed, m.id.startsWith('tmp-')], [false, false, false]);
      expect(rig.repo.sent, [('c1', 'On my way')]);
    });

    test('blank text is never sent', () async {
      final rig = await _boot();
      await rig.controller.send('   ');
      expect(rig.thread.messages, isEmpty);
      expect(rig.repo.sent, isEmpty);
    });

    test('a failure leaves the message marked, and Try again sends it', () async {
      final rig = await _boot();
      rig.repo.sendError = const ApiException('Cannot reach the server', failure: ApiFailure.network);
      await rig.controller.send('Please call me');

      final failed = rig.thread.messages.single;
      expect([failed.failed, failed.pending], [true, false]);
      expect(rig.repo.sent, isEmpty);

      rig.repo.sendError = null;
      await rig.controller.retry(failed.id);
      final done = rig.thread.messages.single;
      expect([done.failed, done.pending, done.text], [false, false, 'Please call me']);
      expect(rig.repo.sent, [('c1', 'Please call me')]);
    });

    test('a failed message can be thrown away', () async {
      final rig = await _boot();
      rig.repo.sendError = const ApiException('Nope', failure: ApiFailure.server, statusCode: 500);
      await rig.controller.send('Oops');
      rig.controller.discard(rig.thread.messages.single.id);
      expect(rig.thread.messages, isEmpty);
    });

    test('the live copy of my own message and the saved copy never show up twice', () async {
      final rig = await _boot();
      rig.repo.sendGate = Completer<void>();
      final sending = rig.controller.send('Same words');

      // The server's push gets here before the send call returns (it has the id the fake will hand out next).
      rig.live.pushMessage(sampleMessage('m100', 'Same words', sender: 'u1', conversation: 'c1'), sampleConversation());
      expect(rig.thread.messages.map((m) => m.text), ['Same words']);
      expect(rig.thread.messages.single.pending, isFalse);

      rig.repo.sendGate!.complete();
      await sending;
      expect(rig.thread.messages, hasLength(1));
    });
  });

  group('live events', () {
    test('a message from the other person appears at once and is marked read', () async {
      final rig = await _boot(messages: [sampleMessage('m1', 'Hi', read: true)]);
      rig.repo.marked.clear();

      rig.live.pushMessage(sampleMessage('m2', 'New one'), sampleConversation(unread: 1, lastText: 'New one'));
      await pumpEventQueue();

      expect(rig.thread.messages.map((m) => m.text), ['Hi', 'New one']);
      expect(rig.repo.marked, ['c1']);
      expect(rig.thread.messages.last.read, isTrue);
    });

    test('the same message delivered twice is shown once', () async {
      final rig = await _boot();
      final m = sampleMessage('m7', 'Once');
      rig.live.pushMessage(m, sampleConversation());
      rig.live.pushMessage(m, sampleConversation());
      expect(rig.thread.messages, hasLength(1));
    });

    test('messages for another conversation are ignored here', () async {
      final rig = await _boot();
      rig.live.pushMessage(sampleMessage('m9', 'Elsewhere', conversation: 'c2'), sampleConversation(id: 'c2'));
      expect(rig.thread.messages, isEmpty);
    });

    test('the other person reading marks my messages seen; my own read events do nothing', () async {
      final rig = await _boot(messages: [sampleMessage('m1', 'Mine', sender: 'u1'), sampleMessage('m2', 'Theirs', read: true)]);
      expect(rig.thread.messages.first.read, isFalse);

      rig.live.pushRead('c1', 'u1');
      expect(rig.thread.messages.first.read, isFalse);
      rig.live.pushRead('c9', 'u2');
      expect(rig.thread.messages.first.read, isFalse);
      rig.live.pushRead('c1', 'u2');
      expect(rig.thread.messages.first.read, isTrue);
    });

    test('shows typing while the other person types, and clears it when their message arrives', () async {
      final rig = await _boot();
      rig.live.pushTyping('c1', 'u2', true);
      expect(rig.thread.otherTyping, isTrue);
      rig.live.pushTyping('c1', 'u1', false); // my own echo is not about them
      expect(rig.thread.otherTyping, isTrue);

      rig.live.pushMessage(sampleMessage('m3', 'Done'), sampleConversation());
      expect(rig.thread.otherTyping, isFalse);
      rig.live.pushTyping('c9', 'u2', true);
      expect(rig.thread.otherTyping, isFalse);
    });

    test('after a reconnect it fetches what it missed and keeps what is still sending', () async {
      final rig = await _boot(messages: [sampleMessage('m1', 'Before', read: true)]);
      rig.repo.sendGate = Completer<void>();
      final sending = rig.controller.send('Still going');

      rig.repo.thread['c1']!.add(sampleMessage('m50', 'While you were away'));
      rig.live.pushConnection(true);
      await pumpEventQueue();

      expect(rig.thread.messages.map((m) => m.text), containsAll(['Before', 'While you were away', 'Still going']));
      expect(rig.thread.messages.where((m) => m.text == 'Still going').single.pending, isTrue);
      rig.repo.sendGate!.complete();
      await sending;
    });
  });

  group('my typing', () {
    test('tells the other person once when I start, and again when I stop', () async {
      final rig = await _boot();
      rig.controller.typing(true);
      rig.controller.typing(true);
      rig.controller.typing(true);
      expect(rig.live.typingSent, [('c1', true)]);

      rig.controller.typing(false);
      expect(rig.live.typingSent, [('c1', true), ('c1', false)]);
      rig.controller.typing(false); // already stopped
      expect(rig.live.typingSent, hasLength(2));
    });

    test('sending a message counts as having stopped typing', () async {
      final rig = await _boot();
      rig.controller.typing(true);
      await rig.controller.send('Hi');
      expect(rig.live.typingSent.last, ('c1', false));
    });
  });

  group('the conversations list', () {
    test('loads, with the unread total available for the badge', () async {
      final rig = await _boot(conversations: [sampleConversation(unread: 2, lastText: 'x'), sampleConversation(id: 'c2', other: 'Meena')]);
      rig.repo.unreadCount = 2;
      expect(rig.container.read(conversationsProvider).items.map((c) => c.id), ['c1', 'c2']);
      expect(await rig.container.read(chatUnreadProvider.future), 2);
    });

    test('a live message moves its conversation to the top with its new text and count', () async {
      final rig = await _boot(conversations: [sampleConversation(lastText: 'old'), sampleConversation(id: 'c2', other: 'Meena', lastText: 'older')]);
      rig.live.pushMessage(sampleMessage('m9', 'Fresh', conversation: 'c2'), sampleConversation(id: 'c2', other: 'Meena', unread: 1, lastText: 'Fresh'));

      final items = rig.container.read(conversationsProvider).items;
      expect(items.map((c) => c.id), ['c2', 'c1']);
      expect([items.first.lastText, items.first.unread], ['Fresh', 1]);
    });

    test('a message in a conversation not yet listed is added, once', () async {
      final rig = await _boot(conversations: [sampleConversation()]);
      final fresh = sampleConversation(id: 'c9', other: 'New person', unread: 1, lastText: 'Hello');
      rig.live.pushMessage(sampleMessage('m1', 'Hello', conversation: 'c9'), fresh);
      rig.live.pushMessage(sampleMessage('m2', 'Hello again', conversation: 'c9'), fresh);

      final state = rig.container.read(conversationsProvider);
      expect(state.items.map((c) => c.id), ['c9', 'c1']);
      expect(state.total, 2);
    });

    test('reading a thread on another device clears its badge here', () async {
      final rig = await _boot(conversations: [sampleConversation(unread: 3, lastText: 'x')]);
      rig.container.read(conversationsProvider.notifier).clearUnread('zzz'); // an unknown id is harmless
      expect(rig.container.read(conversationsProvider).items.single.unread, 3);

      rig.live.pushRead('c1', 'u1');
      expect(rig.container.read(conversationsProvider).items.single.unread, 0);
    });

    test('reloads after the connection comes back', () async {
      final rig = await _boot(conversations: [sampleConversation()]);
      rig.repo.conversationList = [sampleConversation(), sampleConversation(id: 'c2', other: 'Meena')];
      rig.live.pushConnection(true);
      await pumpEventQueue();
      expect(rig.container.read(conversationsProvider).items, hasLength(2));
    });
  });

  group('live updates for the whole app', () {
    test('a pushed notification refreshes the badge and appears at the top of the list', () async {
      final rig = await _boot();
      rig.account.notes = [const NotificationItem(id: 'n1', type: 'a', title: 'Old one', readAt: null)];
      rig.container.listen(notificationsProvider, (_, __) {});
      rig.container.listen(unreadNotificationsProvider, (_, __) {});
      rig.container.listen(liveUpdatesProvider, (_, __) {});
      await pumpEventQueue();
      expect(rig.container.read(unreadNotificationsProvider).valueOrNull, 1);

      rig.account.notes = [const NotificationItem(id: 'n2', type: 'quotation.new', title: 'New quote'), ...rig.account.notes];
      rig.live.pushNotification(const NotificationItem(id: 'n2', type: 'quotation.new', title: 'New quote'), 2);
      await pumpEventQueue();

      expect(rig.container.read(notificationsProvider).items.map((n) => n.id), ['n2', 'n1']);
      expect(rig.container.read(unreadNotificationsProvider).valueOrNull, 2);

      rig.live.pushNotification(const NotificationItem(id: 'n2', type: 'quotation.new', title: 'New quote'), 2); // a repeat is not listed twice
      expect(rig.container.read(notificationsProvider).items.where((n) => n.id == 'n2'), hasLength(1));
    });

    test('a new message refreshes the unread badge', () async {
      final rig = await _boot();
      rig.container.listen(liveUpdatesProvider, (_, __) {});
      rig.container.listen(chatUnreadProvider, (_, __) {});
      await pumpEventQueue();
      expect(rig.container.read(chatUnreadProvider).valueOrNull, 0);

      rig.repo.unreadCount = 4;
      rig.live.pushMessage(sampleMessage('m5', 'Ping', conversation: 'c2'), sampleConversation(id: 'c2', unread: 4));
      await pumpEventQueue();
      expect(rig.container.read(chatUnreadProvider).valueOrNull, 4);
    });
  });
}
