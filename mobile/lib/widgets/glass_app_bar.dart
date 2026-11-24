import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../providers/account_providers.dart';
import '../providers/auth_controller.dart';
import '../routes/route_paths.dart';

/// A see-through app bar with a back arrow, for full-screen pages above the floating bottom bar. Sets the status bar
/// icons dark on the light theme and light on the dark one, so the clock and battery stay readable. A notification bell
/// sits at the right of every page ([bell] false leaves it out, for the notifications page itself).
PreferredSizeWidget glassAppBar(
  BuildContext context,
  String title, {
  List<Widget> actions = const [],
  bool automaticallyImplyLeading = true,
  bool bell = true,
}) {
  final dark = Theme.of(context).brightness == Brightness.dark;
  return AppBar(
    title: Text(title),
    actions: [...actions, if (bell) const NotificationBell()],
    automaticallyImplyLeading: automaticallyImplyLeading,
    backgroundColor: Colors.transparent,
    elevation: 0,
    systemOverlayStyle: dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
  );
}

/// The bell in the app bar: opens the notifications and shows how many are unread. Nothing for someone who is signed out, or
/// for a provider whose account is not verified yet (their notifications open once they are).
class NotificationBell extends ConsumerWidget {
  const NotificationBell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(authControllerProvider.select((auth) => auth.me));
    if (me == null || me.isLocked) return const SizedBox.shrink();
    final unread = ref.watch(unreadNotificationsProvider).valueOrNull ?? 0;
    final theme = Theme.of(context);
    return Semantics(
      button: true,
      label: unread > 0 ? 'Notifications, $unread unread' : 'Notifications',
      excludeSemantics: true,
      child: IconButton(
        tooltip: 'Notifications',
        onPressed: () => context.push(Routes.notifications),
        icon: Stack(
          clipBehavior: Clip.none,
          children: [
            const Icon(Icons.notifications_none),
            if (unread > 0)
              Positioned(
                right: -6,
                top: -6,
                child: Container(
                  constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: theme.colorScheme.error, borderRadius: BorderRadius.circular(8)),
                  child: Text(unread > 99 ? '99+' : '$unread', style: theme.textTheme.labelSmall?.copyWith(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800, height: 1.2)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
