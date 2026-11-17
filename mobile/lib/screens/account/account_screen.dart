import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../models/user.dart';
import '../../providers/account_providers.dart';
import '../../providers/auth_controller.dart';
import '../../providers/chat_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/glass_container.dart';

/// Who is signed in, the way to everything about the account, and the way out.
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('You will need to sign in again to use the app on this phone.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Sign out')),
        ],
      ),
    );
    if (yes == true) await ref.read(authControllerProvider.notifier).signOut();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final user = ref.watch(authControllerProvider).user;
    if (user == null) return const SizedBox.shrink();
    final unread = ref.watch(unreadNotificationsProvider).valueOrNull ?? 0;
    final unreadMessages = ref.watch(chatUnreadProvider).valueOrNull ?? 0;
    final initial = user.name.trim().isEmpty ? '?' : user.name.trim().substring(0, 1).toUpperCase();

    Widget tile(IconData icon, String title, String subtitle, String route, {int badge = 0}) => ListTile(
          leading: Icon(icon),
          title: Text(title),
          subtitle: Text(subtitle),
          minTileHeight: 56,
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (badge > 0)
                Semantics(
                  label: '$badge unread',
                  excludeSemantics: true,
                  child: Badge(label: Text(badge > 99 ? '99+' : '$badge'), backgroundColor: theme.colorScheme.primary, textColor: theme.colorScheme.onPrimary),
                ),
              const Icon(Icons.chevron_right),
            ],
          ),
          onTap: () async {
            await context.push(route);
            ref.invalidate(unreadNotificationsProvider);
            ref.invalidate(chatUnreadProvider);
          },
        );

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(unreadNotificationsProvider);
        ref.invalidate(chatUnreadProvider);
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 110),
        children: [
          Semantics(header: true, child: Text('Account', style: theme.textTheme.headlineMedium)),
          const SizedBox(height: 16),
          GlassContainer(
            child: Row(
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor: theme.colorScheme.primary,
                  child: Text(initial, style: TextStyle(color: theme.colorScheme.onPrimary, fontSize: 22, fontWeight: FontWeight.w700)),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(user.name, style: theme.textTheme.titleLarge),
                      Text(user.email, style: theme.textTheme.bodyMedium),
                      const SizedBox(height: 4),
                      Text(user.role.label, style: theme.textTheme.labelSmall),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          GlassContainer(
            padding: const EdgeInsets.symmetric(vertical: 8),
            // A transparent Material so the tiles' ripples draw on the glass instead of under it.
            child: Material(
              type: MaterialType.transparency,
              child: Column(
                children: [
                  tile(Icons.notifications_none_rounded, 'Notifications', 'Updates about your devices and requests', Routes.notifications, badge: unread),
                  tile(Icons.chat_bubble_outline, 'Messages', 'Conversations with the people you work with', Routes.messages, badge: unreadMessages),
                  tile(Icons.person_outline_rounded, 'Profile', 'Name, phone and your area', Routes.profile),
                  if (user.role.isProvider) tile(Icons.verified_user_outlined, 'Verification', 'Your documents and approval', Routes.verification),
                  tile(Icons.receipt_long_outlined, 'Transaction history', 'What you paid and were paid', Routes.payments),
                  tile(Icons.tune_rounded, 'Settings', 'Theme and messages', Routes.settings),
                  tile(Icons.help_outline_rounded, 'Help and support', 'Common questions and how to reach us', Routes.help),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: () => _confirmSignOut(context, ref),
            icon: const Icon(Icons.logout),
            label: const Text('Sign out'),
            style: OutlinedButton.styleFrom(minimumSize: const Size(48, 48)),
          ),
        ],
      ),
    );
  }
}
