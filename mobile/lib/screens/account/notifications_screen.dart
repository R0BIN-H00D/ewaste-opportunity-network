import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_colors.dart';
import '../../models/account.dart';
import '../../providers/account_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/paged_list.dart';

/// The icon and colour for a kind of update, from the part of its type before the dot ("request.status" is a request).
(IconData, Color) notificationLook(String type) {
  final kind = type.split('.').first;
  switch (kind) {
    case 'request':
    case 'quotation':
    case 'repair':
      return (Icons.build_circle_outlined, AppColors.tileAccents[1]);
    case 'order':
    case 'product':
      return (Icons.shopping_bag_outlined, AppColors.tileAccents[3]);
    case 'donation':
      return (Icons.volunteer_activism_outlined, AppColors.tileAccents[4]);
    case 'pickup':
      return (Icons.event_available_outlined, AppColors.tileAccents[5]);
    case 'recycling':
      return (Icons.recycling_rounded, AppColors.tileAccents[0]);
    case 'chat':
    case 'message':
      return (Icons.chat_bubble_outline, AppColors.tileAccents[2]);
    case 'verification':
      return (Icons.verified_user_outlined, AppColors.tileAccents[2]);
    default:
      return (Icons.notifications_none_rounded, AppColors.tileAccents[0]);
  }
}

/// Everything the platform has told the person, newest first. Unread ones stand out; opening one marks it read and,
/// for a repair request, opens the request.
class NotificationsPage extends ConsumerWidget {
  const NotificationsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
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
            header: GlassContainer(
              radius: 20,
              padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
              child: Row(
                children: [
                  ExcludeSemantics(
                    child: Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(color: (unread == 0 ? AppColors.adapt(context, AppColors.success) : theme.colorScheme.primary).withValues(alpha: 0.13), borderRadius: BorderRadius.circular(13)),
                      child: Icon(unread == 0 ? Icons.done_all_rounded : Icons.notifications_active_outlined, size: 21, color: unread == 0 ? AppColors.adapt(context, AppColors.success) : theme.colorScheme.primary),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(child: Text(unread == 0 ? 'All caught up' : '$unread unread', style: theme.textTheme.titleMedium)),
                  // Flexible: on a small phone, or with large text, the label wraps instead of pushing the row wider than the screen.
                  if (unread > 0) Flexible(child: TextButton(onPressed: markAll, child: const Text('Mark all as read', textAlign: TextAlign.center))),
                ],
              ),
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
    final (icon, base) = notificationLook(item.type);
    final accent = AppColors.adapt(context, base);
    void open() {
      ref.read(notificationsProvider.notifier).markRead(item.id).ignore();
      if (item.requestId != null) context.push(Routes.request(item.requestId!));
    }

    return Semantics(
      button: true,
      label: '${item.isRead ? '' : 'Unread. '}${item.title}. ${item.body ?? ''} ${formatDateTime(item.createdAt)}',
      excludeSemantics: true,
      child: GlassContainer(
        padding: EdgeInsets.zero,
        radius: 20,
        child: Material(
          // Unread ones carry a faint tint of their colour, so they stand out in a long list.
          color: item.isRead ? Colors.transparent : accent.withValues(alpha: 0.07),
          child: InkWell(
            onTap: open,
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ExcludeSemantics(
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(color: accent.withValues(alpha: item.isRead ? 0.10 : 0.16), borderRadius: BorderRadius.circular(14)),
                          child: Icon(icon, size: 22, color: accent),
                        ),
                        if (!item.isRead)
                          Positioned(
                            right: -3,
                            top: -3,
                            child: Container(
                              width: 12,
                              height: 12,
                              decoration: BoxDecoration(color: theme.colorScheme.primary, shape: BoxShape.circle, border: Border.all(color: theme.colorScheme.surface, width: 2)),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(item.title, style: theme.textTheme.titleSmall?.copyWith(fontSize: 15, fontWeight: item.isRead ? FontWeight.w600 : FontWeight.w800)),
                        if ((item.body ?? '').trim().isNotEmpty) ...[const SizedBox(height: 2), Text(item.body!, style: theme.textTheme.bodyMedium)],
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            Icon(Icons.schedule_rounded, size: 13, color: theme.textTheme.bodySmall?.color),
                            const SizedBox(width: 4),
                            Flexible(child: Text(formatDateTime(item.createdAt), style: theme.textTheme.bodySmall)),
                          ],
                        ),
                      ],
                    ),
                  ),
                  if (item.requestId != null) Padding(padding: const EdgeInsets.only(top: 10), child: Icon(Icons.chevron_right_rounded, color: theme.colorScheme.onSurface.withValues(alpha: 0.4))),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
