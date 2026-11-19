import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../models/user.dart';
import '../providers/auth_controller.dart';
import '../providers/chat_providers.dart';
import '../routes/route_paths.dart';
import '../widgets/app_background.dart';
import '../widgets/glass_nav_bar.dart';

/// The signed-in navigator and its persistent bottom destinations.
class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key, required this.location, required this.canChangeTab, required this.child});

  final String location;
  final bool Function() canChangeTab;
  final Widget child;

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  static const _destinations = [Routes.home, Routes.payments, Routes.activity, Routes.account];

  late int _currentIndex = _initialIndex(widget.location);

  int _initialIndex(String path) {
    final index = _destinations.indexOf(path);
    if (index >= 0) return index;
    if (path == Routes.messages ||
        path.startsWith('${Routes.messages}/') ||
        path == Routes.notifications ||
        path == Routes.help) {
      return 2;
    }
    return path.startsWith('${Routes.account}/') ? 3 : 0;
  }

  @override
  void didUpdateWidget(covariant AppShell oldWidget) {
    super.didUpdateWidget(oldWidget);
    // A detail keeps the selection of the tab it was opened from.
    final index = _destinations.indexOf(widget.location);
    if (index >= 0) _currentIndex = index;
  }

  @override
  Widget build(BuildContext context) {
    // Keeps the unread badges and the notification list current for as long as the person is in the app.
    ref.watch(liveUpdatesProvider);
    final isAdmin = ref.watch(authControllerProvider.select((auth) => auth.user?.role == UserRole.admin));
    final scaffold = Scaffold(
      backgroundColor: Colors.transparent,
      body: widget.child,
      bottomNavigationBar: GlassNavBar(
        items: [
          const NavItem(icon: Icons.home_outlined, selectedIcon: Icons.home, label: 'Home'),
          if (isAdmin) ...const [
            NavItem(icon: Icons.verified_user_outlined, selectedIcon: Icons.verified_user, label: 'Verification'),
            NavItem(icon: Icons.assignment_outlined, selectedIcon: Icons.assignment, label: 'Complaints'),
          ] else ...const [
            NavItem(
                icon: Icons.account_balance_wallet_outlined,
                selectedIcon: Icons.account_balance_wallet,
                label: 'Wallet'),
            NavItem(icon: Icons.inbox_outlined, selectedIcon: Icons.inbox, label: 'Messages'),
          ],
          const NavItem(icon: Icons.person_outline, selectedIcon: Icons.person, label: 'Account'),
        ],
        currentIndex: _currentIndex,
        onSelected: (index) {
          if (widget.canChangeTab()) context.go(_destinations[index]);
        },
      ),
    );
    return AppBackground(centerContent: false, child: scaffold);
  }
}
