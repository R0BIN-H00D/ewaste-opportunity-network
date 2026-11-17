import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../models/chat.dart';
import '../../providers/auth_controller.dart';
import '../../providers/chat_providers.dart';
import '../../widgets/app_background.dart';
import '../../widgets/state_views.dart';

/// One conversation: the messages (newest at the bottom), a box to write in, and "typing" and "seen" when the other
/// person is live. Sending works with no live connection; the message simply shows up for them next time they look.
class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key, required this.conversationId, this.title = 'Message', this.subtitle});

  final String conversationId;
  final String title;
  final String? subtitle;

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _text = TextEditingController();
  final _scroll = ScrollController();
  static const _maxLength = 2000;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      // The list is upside down (newest first), so the "end" is the oldest message.
      if (_scroll.hasClients && _scroll.position.extentAfter < 300) ref.read(chatThreadProvider(widget.conversationId).notifier).loadOlder();
    });
  }

  @override
  void dispose() {
    _text.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _send() {
    final text = _text.text.trim();
    if (text.isEmpty) return;
    _text.clear();
    setState(() {});
    ref.read(chatThreadProvider(widget.conversationId).notifier).send(text);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final thread = ref.watch(chatThreadProvider(widget.conversationId));
    final notifier = ref.read(chatThreadProvider(widget.conversationId).notifier);
    final me = ref.watch(authControllerProvider.select((s) => s.user?.id)) ?? '';
    final dark = theme.brightness == Brightness.dark;
    final canSend = _text.text.trim().isNotEmpty;

    final reversed = thread.messages.reversed.toList();
    Widget body;
    if (thread.loading && thread.messages.isEmpty) {
      body = const Center(child: CircularProgressIndicator());
    } else if (thread.error != null && thread.messages.isEmpty) {
      body = Center(child: ErrorState(error: thread.error!, onRetry: notifier.load));
    } else if (thread.messages.isEmpty) {
      body = Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text('No messages yet. Say hello.', style: theme.textTheme.bodyLarge, textAlign: TextAlign.center),
        ),
      );
    } else {
      body = ListView.builder(
        controller: _scroll,
        reverse: true,
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        itemCount: reversed.length + (thread.loadingOlder ? 1 : 0),
        itemBuilder: (context, i) {
          if (i == reversed.length) return const Padding(padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator(strokeWidth: 2)));
          final m = reversed[i];
          // "Seen" goes under the last of my messages the other person has read.
          final lastMineSeen = m.senderId == me && m.read && !reversed.take(i).any((x) => x.senderId == me && x.read);
          final older = i + 1 < reversed.length ? reversed[i + 1] : null;
          return Column(
            children: [
              if (older == null || !_sameDay(older.createdAt, m.createdAt)) _DayLabel(m.createdAt),
              _Bubble(
                message: m,
                mine: m.senderId == me,
                seen: lastMineSeen,
                onRetry: m.failed ? () => notifier.retry(m.id) : null,
                onDiscard: m.failed ? () => notifier.discard(m.id) : null,
              ),
            ],
          );
        },
      );
    }

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        systemOverlayStyle: dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.title, maxLines: 1, overflow: TextOverflow.ellipsis),
            if (thread.otherTyping)
              Text('typing...', style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.primary))
            else if (widget.subtitle != null)
              Text(widget.subtitle!, style: theme.textTheme.labelSmall),
          ],
        ),
      ),
      body: AppBackground(
        child: SafeArea(
          child: Column(
            children: [
              Expanded(child: body),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _text,
                        minLines: 1,
                        maxLines: 5,
                        maxLength: _maxLength,
                        maxLengthEnforcement: MaxLengthEnforcement.enforced,
                        textCapitalization: TextCapitalization.sentences,
                        keyboardType: TextInputType.multiline,
                        decoration: const InputDecoration(hintText: 'Write a message', counterText: ''),
                        onChanged: (value) {
                          setState(() {});
                          notifier.typing(value.trim().isNotEmpty);
                        },
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filled(
                      tooltip: 'Send',
                      onPressed: canSend ? _send : null,
                      icon: const Icon(Icons.send_rounded),
                      style: IconButton.styleFrom(minimumSize: const Size(52, 52)),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static bool _sameDay(DateTime a, DateTime b) {
    final x = a.toLocal();
    final y = b.toLocal();
    return x.year == y.year && x.month == y.month && x.day == y.day;
  }
}

class _DayLabel extends StatelessWidget {
  const _DayLabel(this.date);

  final DateTime date;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final d = date.toLocal();
    final isToday = d.year == now.year && d.month == now.month && d.day == now.day;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Center(child: Text(isToday ? 'Today' : formatChatTime(d, now: now) == 'Yesterday' ? 'Yesterday' : formatDate(d), style: Theme.of(context).textTheme.labelSmall)),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message, required this.mine, required this.seen, this.onRetry, this.onDiscard});

  final ChatMessage message;
  final bool mine;
  final bool seen;
  final VoidCallback? onRetry;
  final VoidCallback? onDiscard;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final time = formatSavedAt(message.createdAt).split(',').last.trim();
    final status = message.failed ? 'Not sent' : message.pending ? 'Sending...' : seen ? 'Seen' : null;

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 3),
          child: Column(
            crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
            children: [
              Semantics(
                label: '${mine ? 'You' : 'Them'}: ${message.text}. $time.${status == null ? '' : ' $status.'}',
                excludeSemantics: true,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: mine ? scheme.primary.withValues(alpha: message.pending ? 0.6 : 1) : scheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(18),
                      topRight: const Radius.circular(18),
                      bottomLeft: Radius.circular(mine ? 18 : 4),
                      bottomRight: Radius.circular(mine ? 4 : 18),
                    ),
                  ),
                  child: SelectableText(message.text, style: theme.textTheme.bodyLarge?.copyWith(color: mine ? scheme.onPrimary : scheme.onSurface)),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 2, 4, 0),
                child: message.failed
                    ? Wrap(
                        spacing: 8,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Text('Not sent', style: theme.textTheme.labelSmall?.copyWith(color: scheme.error)),
                          TextButton(onPressed: onRetry, style: TextButton.styleFrom(minimumSize: const Size(48, 40), padding: const EdgeInsets.symmetric(horizontal: 8)), child: const Text('Try again')),
                          TextButton(onPressed: onDiscard, style: TextButton.styleFrom(minimumSize: const Size(48, 40), padding: const EdgeInsets.symmetric(horizontal: 8)), child: const Text('Delete')),
                        ],
                      )
                    : Text(status == null ? time : '$time · $status', style: theme.textTheme.labelSmall),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Opens a thread by its id. Who it is with comes from [conversation] (passed when it was just opened) or the conversations list.
class ChatPage extends ConsumerWidget {
  const ChatPage({super.key, required this.conversationId, this.conversation});

  final String conversationId;
  final Conversation? conversation;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = conversation ?? ref.watch(conversationsProvider).items.where((x) => x.id == conversationId).firstOrNull;
    return ChatScreen(conversationId: conversationId, title: c?.otherName ?? 'Message', subtitle: c?.contextLabel);
  }
}
