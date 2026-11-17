import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../providers/chat_providers.dart';
import '../widgets/app_background.dart';
import '../widgets/glass_nav_bar.dart';

const _items = [
  NavItem(icon: Icons.home_outlined, selectedIcon: Icons.home, label: 'Home'),
  NavItem(icon: Icons.person_outline, selectedIcon: Icons.person, label: 'Account'),
];

/// The signed-in app: the current tab with a floating glass bar underneath.
/// Tabs keep their own state when you switch between them. More tabs are added with each role's screens.
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Keeps the unread badges and the notification list current for as long as the person is in the app.
    ref.watch(liveUpdatesProvider);
    return Scaffold(
      extendBody: true,
      body: AppBackground(child: SafeArea(bottom: false, child: navigationShell)),
      bottomNavigationBar: GlassNavBar(
        items: _items,
        currentIndex: navigationShell.currentIndex,
        onSelected: (index) => navigationShell.goBranch(index, initialLocation: index == navigationShell.currentIndex),
      ),
    );
  }
}
