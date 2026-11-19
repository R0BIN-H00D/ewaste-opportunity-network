import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../core/theme/app_colors.dart';
import '../providers/account_providers.dart';
import '../providers/chat_providers.dart';
import '../routes/route_paths.dart';
import '../widgets/menu_section.dart';

class ActivityScreen extends ConsumerWidget {
  const ActivityScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(unreadNotificationsProvider).valueOrNull ?? 0;
    final unreadMessages = ref.watch(chatUnreadProvider).valueOrNull ?? 0;
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(unreadNotificationsProvider);
        ref.invalidate(chatUnreadProvider);
      },
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 120),
        children: [
          Semantics(header: true, child: Text('Messages', style: Theme.of(context).textTheme.headlineMedium)),
          const SizedBox(height: 20),
          MenuSection(rows: [
            MenuRow(
              icon: Icons.notifications_none_rounded,
              accent: AppColors.tileAccents[3],
              title: 'Notifications',
              subtitle: 'Updates about your devices and requests',
              badge: unread,
              onTap: () => context.push(Routes.notifications),
            ),
          ]),
          const SizedBox(height: 12),
          MenuSection(rows: [
            MenuRow(
              icon: Icons.chat_bubble_outline,
              accent: AppColors.tileAccents[0],
              title: 'Conversations',
              subtitle: 'Chat with the people you work with',
              badge: unreadMessages,
              onTap: () => context.push(Routes.messages),
            ),
          ]),
          const SizedBox(height: 12),
          MenuSection(rows: [
            MenuRow(
              icon: Icons.support_agent_rounded,
              accent: AppColors.tileAccents[1],
              title: 'Help & Support',
              subtitle: 'Find answers or contact our team',
              onTap: () => context.push(Routes.help),
            ),
          ]),
        ],
      ),
    );
  }
}
