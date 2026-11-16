import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../models/account.dart';
import '../../providers/account_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/paged_list.dart';

/// Everything the platform has told the person, newest first. Unread ones stand out; opening one marks it read and,
/// for a repair request, opens the request.
class NotificationsPage extends ConsumerWidget {
  const NotificationsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(unreadNotificationsProvider).valueOrNull ?? 0;
    Future<void> markAll() async {
      try {
        await ref.read(notificationsProvider.notifier).markAllRead();
      } on ApiException catch (e) {
        if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Notifications'),
      body: AppBackground(
        child: SafeArea(
          child: PagedList<NotificationItem>(
            provider: notificationsProvider,
            header: Row(
              children: [
                Expanded(child: Text(unread == 0 ? 'All caught up' : '$unread unread', style: Theme.of(context).textTheme.titleMedium)),
                if (unread > 0) TextButton(onPressed: markAll, child: const Text('Mark all as read')),
              ],
            ),
            itemBuilder: (context, n) => _NotificationCard(item: n),
            emptyTitle: 'No notifications yet',
            emptyMessage: 'Quotes, handovers and other updates about your devices will show here.',
            emptyIcon: Icons.notifications_none_rounded,
            skeletonHeight: 76,
          ),
        ),
      ),
    );
  }
}

class _NotificationCard extends ConsumerWidget {
  const _NotificationCard({required this.item});

  final NotificationItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    void open() {
      ref.read(notificationsProvider.notifier).markRead(item.id).ignore();
      if (item.requestId != null) context.push(Routes.request(item.requestId!));
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Semantics(
        button: true,
        label: '${item.isRead ? '' : 'Unread. '}${item.title}. ${item.body ?? ''} ${formatDateTime(item.createdAt)}',
        excludeSemantics: true,
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: open,
          child: GlassContainer(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.only(top: 6, right: 12),
                  child: Icon(Icons.circle, size: 10, color: item.isRead ? Colors.transparent : theme.colorScheme.primary),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(item.title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: item.isRead ? FontWeight.w500 : FontWeight.w700)),
                      if ((item.body ?? '').trim().isNotEmpty) Text(item.body!, style: theme.textTheme.bodyMedium),
                      const SizedBox(height: 4),
                      Text(formatDateTime(item.createdAt), style: theme.textTheme.bodyMedium?.copyWith(fontSize: 12)),
                    ],
                  ),
                ),
                if (item.requestId != null) const Icon(Icons.chevron_right),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
