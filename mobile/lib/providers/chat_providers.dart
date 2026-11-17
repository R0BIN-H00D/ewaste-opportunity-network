import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/constants/app_constants.dart';
import '../core/network/api_exception.dart';
import '../models/chat.dart';
import '../models/page_result.dart';
import '../services/chat_repository.dart';
import '../services/realtime_service.dart';
import 'account_providers.dart';
import 'auth_controller.dart';
import 'core_providers.dart';
import 'paged.dart';

final chatRepositoryProvider = Provider<ChatRepository>((ref) => ChatRepository(ref.watch(apiClientProvider)));

/// The live connection for the signed-in person: made when they sign in, closed when they sign out.
/// Tests override this with a fake that lets them push events.
final realtimeServiceProvider = Provider<RealtimeService>((ref) {
  final userId = ref.watch(authControllerProvider.select((s) => s.user?.id));
  if (userId == null) return const NoRealtime();
  final service = SocketRealtimeService(api: ref.watch(apiClientProvider), url: AppConstants.socketUrl)..connect();
  ref.onDispose(service.dispose);
  return service;
});

/// Messages waiting for me across all conversations, for the badge. Refreshed whenever something arrives.
final chatUnreadProvider = FutureProvider.autoDispose<int>((ref) {
  ref.watch(authControllerProvider.select((s) => s.user?.id));
  return ref.watch(chatRepositoryProvider).unread();
});

/// My conversations, newest activity first. Stays current while the live connection is up.
class ConversationsController extends PagedNotifier<Conversation> {
  @override
  Paged<Conversation> build() {
    ref.watch(authControllerProvider.select((s) => s.user?.id));
    final live = ref.watch(realtimeServiceProvider);
    final subs = [
      live.messages.listen(_onMessage),
      live.reads.listen(_onRead),
      // Anything missed while offline arrives with the next full load.
      live.connection.where((connected) => connected).listen((_) => load()),
    ];
    ref.onDispose(() {
      for (final s in subs) {
        s.cancel();
      }
    });
    return start();
  }

  @override
  Future<PageResult<Conversation>> fetch(int page) async => (await ref.read(chatRepositoryProvider).conversations(page: page)).page;

  void _onMessage(MessageEvent e) {
    if (!state.loaded) return;
    final rest = state.items.where((c) => c.id != e.conversation.id).toList();
    state = state.copyWith(items: [e.conversation, ...rest], total: state.total + (rest.length == state.items.length ? 1 : 0));
  }

  void _onRead(ReadEvent e) {
    // I read it on another device: it is no longer unread here either.
    final me = ref.read(authControllerProvider).user?.id;
    if (e.byUserId == me) clearUnread(e.conversationId);
  }

  void clearUnread(String conversationId) {
    state = state.copyWith(items: [for (final c in state.items) c.id == conversationId ? c.copyWith(unread: 0) : c]);
  }
}

final conversationsProvider = NotifierProvider<ConversationsController, Paged<Conversation>>(ConversationsController.new);

/// What the screen for one thread shows.
class ChatThread {
  const ChatThread({this.messages = const [], this.loading = false, this.loadingOlder = false, this.hasMore = false, this.error, this.otherTyping = false});

  /// Oldest first, including messages still being sent and ones that failed.
  final List<ChatMessage> messages;
  final bool loading;
  final bool loadingOlder;
  final bool hasMore;
  final ApiException? error;
  final bool otherTyping;

  ChatThread copyWith({List<ChatMessage>? messages, bool? loading, bool? loadingOlder, bool? hasMore, ApiException? error, bool clearError = false, bool? otherTyping}) => ChatThread(
        messages: messages ?? this.messages,
        loading: loading ?? this.loading,
        loadingOlder: loadingOlder ?? this.loadingOlder,
        hasMore: hasMore ?? this.hasMore,
        error: clearError ? null : (error ?? this.error),
        otherTyping: otherTyping ?? this.otherTyping,
      );
}

/// One conversation: the messages, sending, reading and who is typing. Lives while its screen is open.
class ChatThreadController extends AutoDisposeFamilyNotifier<ChatThread, String> {
  String? _before;
  int _temp = 0;
  Timer? _otherTypingTimer;
  Timer? _myTypingTimer;
  bool _iAmTyping = false;

  ChatRepository get _repo => ref.read(chatRepositoryProvider);
  String get _me => ref.read(authControllerProvider).user?.id ?? '';

  @override
  ChatThread build(String arg) {
    final live = ref.watch(realtimeServiceProvider);
    final subs = [
      live.messages.listen(_onMessage),
      live.reads.listen(_onRead),
      live.typing.listen(_onTyping),
      // Catch up on anything sent while the connection was down.
      live.connection.where((connected) => connected).listen((_) => refresh()),
    ];
    ref.onDispose(() {
      for (final s in subs) {
        s.cancel();
      }
      _otherTypingTimer?.cancel();
      _myTypingTimer?.cancel();
      if (_iAmTyping) live.sendTyping(arg, false);
    });
    Future.microtask(load);
    return const ChatThread(loading: true);
  }

  Future<void> load() async {
    state = state.copyWith(loading: true, clearError: true);
    try {
      final page = await _repo.messages(arg);
      _before = page.nextBefore;
      state = state.copyWith(messages: page.items, hasMore: page.hasMore, loading: false);
      await markRead();
    } on ApiException catch (e) {
      state = state.copyWith(loading: false, error: e);
    }
  }

  /// Fetches the newest messages again and merges them in, keeping anything still being sent.
  Future<void> refresh() async {
    try {
      final page = await _repo.messages(arg);
      final known = {for (final m in state.messages) m.id};
      final fresh = page.items.where((m) => !known.contains(m.id)).toList();
      final updated = [for (final m in state.messages) page.items.where((p) => p.id == m.id).firstOrNull ?? m];
      state = state.copyWith(messages: _sorted([...updated, ...fresh]));
      if (fresh.any((m) => m.senderId != _me)) await markRead();
    } on ApiException {
      // The next event or refresh will try again.
    }
  }

  Future<void> loadOlder() async {
    if (state.loadingOlder || !state.hasMore || _before == null) return;
    state = state.copyWith(loadingOlder: true, clearError: true);
    try {
      final page = await _repo.messages(arg, before: _before);
      _before = page.nextBefore;
      state = state.copyWith(messages: [...page.items, ...state.messages], hasMore: page.hasMore, loadingOlder: false);
    } on ApiException catch (e) {
      state = state.copyWith(loadingOlder: false, error: e);
    }
  }

  List<ChatMessage> _sorted(List<ChatMessage> list) => [...list]..sort((a, b) => a.createdAt.compareTo(b.createdAt));

  /// Shows the message at once as "sending", then replaces it with the saved one. On failure it stays, marked, for a retry.
  Future<void> send(String text) async {
    final body = text.trim();
    if (body.isEmpty) return;
    final temp = ChatMessage(id: 'tmp-${_temp++}', conversationId: arg, senderId: _me, text: body, createdAt: DateTime.now(), pending: true);
    state = state.copyWith(messages: [...state.messages, temp]);
    stopTyping();
    await _deliver(temp);
  }

  Future<void> retry(String tempId) async {
    final failed = state.messages.where((m) => m.id == tempId && m.failed).firstOrNull;
    if (failed == null) return;
    final again = failed.copyWith(pending: true, failed: false);
    state = state.copyWith(messages: [for (final m in state.messages) m.id == tempId ? again : m]);
    await _deliver(again);
  }

  Future<void> _deliver(ChatMessage temp) async {
    try {
      final saved = await _repo.send(arg, temp.text);
      final without = state.messages.where((m) => m.id != temp.id).toList();
      // The live copy may have got here first; never show the message twice.
      final already = without.any((m) => m.id == saved.id);
      state = state.copyWith(messages: _sorted(already ? without : [...without, saved]));
      ref.read(conversationsProvider.notifier).clearUnread(arg);
    } on ApiException {
      state = state.copyWith(messages: [for (final m in state.messages) m.id == temp.id ? temp.copyWith(pending: false, failed: true) : m]);
    }
  }

  void discard(String tempId) => state = state.copyWith(messages: state.messages.where((m) => m.id != tempId).toList());

  /// I have seen everything in the thread: tells the server (which tells the other person) and clears the badge.
  Future<void> markRead() async {
    final waiting = state.messages.any((m) => m.senderId != _me && !m.read);
    try {
      if (waiting) await _repo.markRead(arg);
    } on ApiException {
      return;
    }
    state = state.copyWith(messages: [for (final m in state.messages) m.senderId != _me ? m.copyWith(read: true) : m]);
    ref.read(conversationsProvider.notifier).clearUnread(arg);
    ref.invalidate(chatUnreadProvider);
  }

  void _onMessage(MessageEvent e) {
    final m = e.message;
    if (m.conversationId != arg) return;
    if (state.messages.any((x) => x.id == m.id)) return;
    var list = state.messages;
    if (m.senderId == _me) {
      // My own message coming back from the server replaces the copy still showing as "sending".
      final pendingIndex = list.indexWhere((x) => x.pending && x.text == m.text);
      if (pendingIndex >= 0) list = [...list]..removeAt(pendingIndex);
    }
    state = state.copyWith(messages: _sorted([...list, m]), otherTyping: m.senderId == _me ? state.otherTyping : false);
    if (m.senderId != _me) markRead();
  }

  void _onRead(ReadEvent e) {
    if (e.conversationId != arg || e.byUserId == _me) return;
    state = state.copyWith(messages: [for (final m in state.messages) m.senderId == _me ? m.copyWith(read: true) : m]);
  }

  void _onTyping(TypingEvent e) {
    if (e.conversationId != arg || e.userId == _me) return;
    _otherTypingTimer?.cancel();
    state = state.copyWith(otherTyping: e.typing);
    // If the "stopped typing" message is lost, do not show it forever.
    if (e.typing) _otherTypingTimer = Timer(const Duration(seconds: 6), () => state = state.copyWith(otherTyping: false));
  }

  /// Call as the composer text changes. Tells the other person once, then again as "stopped" after a pause.
  void typing(bool hasText) {
    final live = ref.read(realtimeServiceProvider);
    _myTypingTimer?.cancel();
    if (!hasText) return stopTyping();
    if (!_iAmTyping) {
      _iAmTyping = true;
      live.sendTyping(arg, true);
    }
    _myTypingTimer = Timer(const Duration(seconds: 3), stopTyping);
  }

  void stopTyping() {
    _myTypingTimer?.cancel();
    if (!_iAmTyping) return;
    _iAmTyping = false;
    ref.read(realtimeServiceProvider).sendTyping(arg, false);
  }
}

final chatThreadProvider = NotifierProvider.autoDispose.family<ChatThreadController, ChatThread, String>(ChatThreadController.new);

/// Keeps the badges and the notification list in step with what the server pushes. Watched once, by the signed-in shell.
final liveUpdatesProvider = Provider<void>((ref) {
  final live = ref.watch(realtimeServiceProvider);
  final subs = [
    live.messages.listen((_) => ref.invalidate(chatUnreadProvider)),
    live.notifications.listen((push) {
      ref.invalidate(unreadNotificationsProvider);
      ref.read(notificationsProvider.notifier).addLive(push.notification);
    }),
    // A reconnect may follow a gap: ask again for the numbers.
    live.connection.where((connected) => connected).listen((_) {
      ref.invalidate(chatUnreadProvider);
      ref.invalidate(unreadNotificationsProvider);
    }),
  ];
  ref.onDispose(() {
    for (final s in subs) {
      s.cancel();
    }
  });
});
