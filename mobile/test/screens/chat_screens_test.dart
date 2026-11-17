import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/providers/account_providers.dart';
import 'package:ewaste_opportunity/providers/auth_controller.dart';
import 'package:ewaste_opportunity/providers/chat_providers.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/routes/route_paths.dart';
import 'package:ewaste_opportunity/screens/chat/chat_screen.dart';
import 'package:ewaste_opportunity/screens/chat/conversations_screen.dart';
import 'package:ewaste_opportunity/widgets/message_button.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../fakes.dart';
import '../helpers.dart';

class _Rig {
  _Rig(this.repo, this.live);

  final FakeChatRepository repo;
  final FakeRealtime live;
}

Future<_Rig> _pump(WidgetTester tester, Widget home, {FakeChatRepository? repo, double scale = 1}) async {
  tester.view.physicalSize = const Size(360, 740);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final chat = repo ?? FakeChatRepository();
  final live = FakeRealtime();

  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (_, __) => Scaffold(body: home)),
    GoRoute(path: Routes.messagePattern, builder: (_, state) => Scaffold(body: Text('THREAD ${state.pathParameters['id']}'))),
  ]);
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository(loginResult: sampleMe())),
        chatRepositoryProvider.overrideWithValue(chat),
        realtimeServiceProvider.overrideWithValue(live),
        accountRepositoryProvider.overrideWithValue(FakeAccountRepository()),
      ],
      child: MaterialApp.router(
        theme: AppTheme.light(),
        routerConfig: router,
        builder: (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)), child: child!),
      ),
    ),
  );
  final container = ProviderScope.containerOf(tester.element(find.byType(MaterialApp)));
  await container.read(authControllerProvider.notifier).signIn(email: 'asha@example.com', password: 'x');
  await _settle(tester);
  return _Rig(chat, live);
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  group('the conversations list', () {
    testWidgets('shows who, what about, the newest message and the unread count', (tester) async {
      final repo = FakeChatRepository()
        ..conversationList = [
          sampleConversation(other: 'Ravi Kumar', lastText: 'See you at five', unread: 3),
          sampleConversation(id: 'c2', other: 'Meena', contextType: 'order', lastText: 'Thanks!', lastMine: true),
        ];
      await _pump(tester, const ConversationsScreen(), repo: repo);

      expect(find.text('Ravi Kumar'), findsOneWidget);
      expect(find.text('Repair'), findsOneWidget);
      expect(find.text('See you at five'), findsOneWidget);
      expect(find.text('3'), findsOneWidget);
      expect(find.text('Meena'), findsOneWidget);
      expect(find.text('Order'), findsOneWidget);
      expect(find.text('You: Thanks!'), findsOneWidget);
    });

    testWidgets('a thread nobody has written in says so', (tester) async {
      await _pump(tester, const ConversationsScreen(), repo: FakeChatRepository()..conversationList = [sampleConversation()]);
      expect(find.text('No messages yet'), findsOneWidget);
    });

    testWidgets('with no conversations it explains how to start one', (tester) async {
      await _pump(tester, const ConversationsScreen());
      expect(find.text('No messages yet'), findsOneWidget);
      expect(find.textContaining('tap Message'), findsOneWidget);
    });

    testWidgets('tapping a conversation opens its thread', (tester) async {
      final repo = FakeChatRepository()..conversationList = [sampleConversation(id: 'c42', lastText: 'Hi')];
      await _pump(tester, const ConversationsScreen(), repo: repo);

      await tester.tap(find.text('Ravi Kumar'));
      await _settle(tester);
      expect(find.text('THREAD c42'), findsOneWidget);
    });

    testWidgets('a live message moves its conversation up with the new text', (tester) async {
      final repo = FakeChatRepository()..conversationList = [sampleConversation(lastText: 'old'), sampleConversation(id: 'c2', other: 'Meena', lastText: 'older')];
      final rig = await _pump(tester, const ConversationsScreen(), repo: repo);

      rig.live.pushMessage(sampleMessage('m9', 'Fresh news', conversation: 'c2'), sampleConversation(id: 'c2', other: 'Meena', unread: 1, lastText: 'Fresh news'));
      await _settle(tester);

      expect(find.text('Fresh news'), findsOneWidget);
      expect(tester.getTopLeft(find.text('Meena')).dy, lessThan(tester.getTopLeft(find.text('Ravi Kumar')).dy));
    });
  });

  group('a thread', () {
    FakeChatRepository withMessages() => FakeChatRepository()
      ..conversationList = [sampleConversation(lastText: 'x')]
      ..thread['c1'] = [
        sampleMessage('m1', 'Is it fixed yet?', sender: 'u1', read: true),
        sampleMessage('m2', 'Almost. Needs a new battery.', read: true),
        sampleMessage('m3', 'How long will that take?', sender: 'u1', read: true),
      ];

    testWidgets('shows every message, with "Seen" under the last of mine that was read', (tester) async {
      await _pump(tester, const ChatScreen(conversationId: 'c1', title: 'Ravi Kumar', subtitle: 'Repair'), repo: withMessages());

      expect(find.text('Is it fixed yet?'), findsOneWidget);
      expect(find.text('Almost. Needs a new battery.'), findsOneWidget);
      expect(find.text('How long will that take?'), findsOneWidget);
      expect(find.text('Ravi Kumar'), findsOneWidget);
      expect(find.text('Repair'), findsOneWidget);
      expect(find.textContaining('Seen'), findsOneWidget, reason: 'only the newest of my read messages carries it');
    });

    testWidgets('an empty thread invites the first message', (tester) async {
      await _pump(tester, const ChatScreen(conversationId: 'c1'), repo: FakeChatRepository());
      expect(find.text('No messages yet. Say hello.'), findsOneWidget);
    });

    testWidgets('Send is off until there is something to send, then sends and clears the box', (tester) async {
      final repo = withMessages();
      await _pump(tester, const ChatScreen(conversationId: 'c1'), repo: repo);

      IconButton send() => tester.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.send_rounded));
      expect(send().onPressed, isNull);

      await tester.enterText(find.byType(TextField), '   ');
      await tester.pump();
      expect(send().onPressed, isNull, reason: 'spaces alone are not a message');

      await tester.enterText(find.byType(TextField), 'About two days');
      await tester.pump();
      expect(send().onPressed, isNotNull);
      await tester.tap(find.byTooltip('Send'));
      await _settle(tester);

      expect(repo.sent, [('c1', 'About two days')]);
      expect(find.text('About two days'), findsOneWidget);
      expect(tester.widget<TextField>(find.byType(TextField)).controller!.text, isEmpty);
    });

    testWidgets('a message that fails says so and can be tried again or deleted', (tester) async {
      final repo = withMessages()..sendError = const ApiException('Cannot reach the server', failure: ApiFailure.network);
      await _pump(tester, const ChatScreen(conversationId: 'c1'), repo: repo);

      await tester.enterText(find.byType(TextField), 'Are you free tomorrow?');
      await tester.pump();
      await tester.tap(find.byTooltip('Send'));
      await _settle(tester);
      expect(find.text('Not sent'), findsOneWidget);
      expect(find.text('Try again'), findsOneWidget);

      repo.sendError = null;
      await tester.tap(find.text('Try again'));
      await _settle(tester);
      expect(find.text('Not sent'), findsNothing);
      expect(repo.sent, [('c1', 'Are you free tomorrow?')]);
    });

    testWidgets('Delete removes a message that did not send', (tester) async {
      final repo = withMessages()..sendError = const ApiException('Nope', failure: ApiFailure.server);
      await _pump(tester, const ChatScreen(conversationId: 'c1'), repo: repo);

      await tester.enterText(find.byType(TextField), 'Never mind');
      await tester.pump();
      await tester.tap(find.byTooltip('Send'));
      await _settle(tester);
      await tester.tap(find.text('Delete'));
      await _settle(tester);
      expect(find.text('Never mind'), findsNothing);
    });

    testWidgets('a message from the other person shows up while the screen is open', (tester) async {
      final rig = await _pump(tester, const ChatScreen(conversationId: 'c1'), repo: withMessages());
      rig.live.pushMessage(sampleMessage('m4', 'Ready tomorrow!'), sampleConversation());
      await _settle(tester);
      expect(find.text('Ready tomorrow!'), findsOneWidget);
    });

    testWidgets('shows "typing..." under the name, and drops it if the stop signal is lost', (tester) async {
      final rig = await _pump(tester, const ChatScreen(conversationId: 'c1', title: 'Ravi Kumar', subtitle: 'Repair'), repo: withMessages());
      expect(find.text('typing...'), findsNothing);

      rig.live.pushTyping('c1', 'u2', true);
      await tester.pump();
      expect(find.text('typing...'), findsOneWidget);
      expect(find.text('Repair'), findsNothing);

      await tester.pump(const Duration(seconds: 7));
      expect(find.text('typing...'), findsNothing);
      expect(find.text('Repair'), findsOneWidget);
    });

    testWidgets('typing in the box tells the other person, and stops after a pause', (tester) async {
      final rig = await _pump(tester, const ChatScreen(conversationId: 'c1'), repo: withMessages());
      await tester.enterText(find.byType(TextField), 'H');
      await tester.pump();
      expect(rig.live.typingSent, [('c1', true)]);

      await tester.pump(const Duration(seconds: 4));
      expect(rig.live.typingSent, [('c1', true), ('c1', false)]);
    });

    testWidgets('a thread that cannot load shows why and loads when retried', (tester) async {
      final repo = FakeChatRepository()..messagesError = const ApiException('Cannot reach the server', failure: ApiFailure.network);
      await _pump(tester, const ChatScreen(conversationId: 'c1'), repo: repo);
      expect(find.textContaining('Cannot reach the server'), findsWidgets);

      repo
        ..messagesError = null
        ..thread['c1'] = [sampleMessage('m1', 'Back online', read: true)];
      await tester.tap(find.text('Try again'));
      await _settle(tester);
      expect(find.text('Back online'), findsOneWidget);
    });

    testWidgets('the box stops at 2000 characters', (tester) async {
      await _pump(tester, const ChatScreen(conversationId: 'c1'), repo: withMessages());
      await tester.enterText(find.byType(TextField), 'x' * 2100);
      await tester.pump();
      expect(tester.widget<TextField>(find.byType(TextField)).controller!.text.length, 2000);
    });

    testWidgets('long messages and large text still fit', (tester) async {
      final repo = FakeChatRepository()
        ..thread['c1'] = [
          sampleMessage('m1', 'A very long message ' * 20, sender: 'u1', read: true),
          sampleMessage('m2', 'Another very long reply from the other side ' * 10, read: true),
        ];
      await _pump(tester, const ChatScreen(conversationId: 'c1', title: 'A person with a rather long name indeed', subtitle: 'Question about a device'), repo: repo, scale: 2);
      expect(tester.takeException(), isNull);
    });
  });

  group('the Message button', () {
    testWidgets('asks for the thread by what it is about, then opens it', (tester) async {
      final repo = FakeChatRepository()..openResult = sampleConversation(id: 'c77', contextType: 'order');
      await _pump(tester, const MessageButton(contextType: 'order', contextId: 'o5', label: 'Message Meena'), repo: repo);

      await tester.tap(find.text('Message Meena'));
      await _settle(tester);

      expect(repo.opened, [('order', 'o5')]);
      expect(find.text('THREAD c77'), findsOneWidget);
    });

    testWidgets('when there is nobody to message it says why and stays put', (tester) async {
      final repo = FakeChatRepository()..openError = const ApiException('There is nobody to message here', failure: ApiFailure.notFound, statusCode: 404);
      await _pump(tester, const MessageButton(contextType: 'service', contextId: 'r1'), repo: repo);

      await tester.tap(find.text('Message'));
      await _settle(tester);

      expect(find.text('There is nobody to message here'), findsOneWidget);
      expect(find.textContaining('THREAD'), findsNothing);
      expect(tester.widget<OutlinedButton>(find.byType(OutlinedButton)).onPressed, isNotNull, reason: 'it can be tried again');
    });
  });
}
