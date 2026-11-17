import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../models/chat.dart';
import '../../providers/chat_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/paged_list.dart';

/// Everyone the person has talked to, newest first, with how many messages are waiting in each.
class ConversationsScreen extends ConsumerWidget {
  const ConversationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return PagedList<Conversation>(
      provider: conversationsProvider,
      header: const SizedBox.shrink(),
      itemBuilder: (context, c) => ConversationTile(conversation: c, onTap: () => context.push(Routes.message(c.id))),
      emptyTitle: 'No messages yet',
      emptyMessage: 'Open a repair, an order or a device and tap Message to start a conversation.',
      emptyIcon: Icons.chat_bubble_outline,
      skeletonHeight: 84,
    );
  }
}

class ConversationsPage extends StatelessWidget {
  const ConversationsPage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        extendBodyBehindAppBar: true,
        appBar: glassAppBar(context, 'Messages'),
        body: const AppBackground(child: SafeArea(child: ConversationsScreen())),
      );
}

class ConversationTile extends StatelessWidget {
  const ConversationTile({super.key, required this.conversation, required this.onTap});

  final Conversation conversation;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final c = conversation;
    final initial = c.otherName.trim().isEmpty ? '?' : c.otherName.trim().substring(0, 1).toUpperCase();
    final unread = c.unread > 0;
    final preview = c.lastText == null ? 'No messages yet' : '${c.lastMine ? 'You: ' : ''}${c.lastText}';
    final when = formatChatTime(c.lastAt ?? c.updatedAt);

    return Semantics(
      button: true,
      label: '${c.otherName}, ${c.contextLabel}. $preview.${unread ? ' ${c.unread} unread.' : ''}',
      excludeSemantics: true,
      child: GlassContainer(
        padding: EdgeInsets.zero,
        // A transparent Material so the ripple draws on the glass instead of under it.
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 24,
                    backgroundColor: theme.colorScheme.primary,
                    child: Text(initial, style: TextStyle(color: theme.colorScheme.onPrimary, fontSize: 18, fontWeight: FontWeight.w700)),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(child: Text(c.otherName, maxLines: 1, overflow: TextOverflow.ellipsis, style: theme.textTheme.titleLarge?.copyWith(fontSize: 17, fontWeight: unread ? FontWeight.w800 : FontWeight.w600))),
                            const SizedBox(width: 8),
                            Text(when, style: theme.textTheme.labelSmall),
                          ],
                        ),
                        Text(c.contextLabel, style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.primary)),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            Expanded(child: Text(preview, maxLines: 2, overflow: TextOverflow.ellipsis, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: unread ? FontWeight.w700 : null))),
                            if (unread) ...[
                              const SizedBox(width: 8),
                              Badge(label: Text(c.unread > 99 ? '99+' : '${c.unread}'), backgroundColor: theme.colorScheme.primary, textColor: theme.colorScheme.onPrimary),
                            ],
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
