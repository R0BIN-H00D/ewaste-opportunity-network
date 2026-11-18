import 'package:material_ui/material_ui.dart';
import '../../models/user.dart';
import '../../routes/route_paths.dart';

/// One thing a person can do from the home screen. Screens for each are added slice by slice; until then they show "Soon".
class QuickAction {
  const QuickAction(
      {required this.icon,
      required this.title,
      required this.subtitle,
      this.route});

  final IconData icon;
  final String title;
  final String subtitle;

  /// Where the tile goes. `null` while its screen has not been built yet (the tile then shows "Soon").
  final String? route;
}

const _messages = QuickAction(
    icon: Icons.chat_bubble_outline,
    title: 'Messages',
    subtitle: 'Talk to the people you are working with',
    route: Routes.messages);

const _profile = QuickAction(
    icon: Icons.person_outline,
    title: 'Profile',
    subtitle: 'Your details, address and location',
    route: Routes.profile);

const _notifications = QuickAction(
    icon: Icons.notifications_none,
    title: 'Notifications',
    subtitle: 'What has happened since you last looked',
    route: Routes.notifications);

const _wanted = QuickAction(
    icon: Icons.manage_search_outlined,
    title: 'Wanted devices',
    subtitle: 'Devices refurbishers are looking for. Accept the ones you can help with',
    route: Routes.wanted);

const _learn = QuickAction(
    icon: Icons.menu_book_outlined,
    title: 'Learning centre',
    subtitle: 'Guides on safe disposal, repair and protecting your data',
    route: Routes.learn);

const _pickups = QuickAction(
    icon: Icons.event_available_outlined,
    title: 'My pickups',
    subtitle: 'Collections and handovers, and when they are',
    route: Routes.pickups);

/// The home screen's quick actions for a role. Mirrors the web dashboard's side panel for that role: Profile first,
/// then what the role does every day, then Pickups, Messages and Notifications.
List<QuickAction> actionsFor(UserRole role) => [
      if (role != UserRole.admin) _profile,
      ..._roleActions(role),
      if (role != UserRole.admin) ...[_pickups, _messages, _notifications, _learn]
    ];

List<QuickAction> _roleActions(UserRole role) {
  switch (role) {
    case UserRole.user:
      return const [
        QuickAction(
            icon: Icons.devices_other_outlined,
            title: 'My devices',
            subtitle: 'List a device and see where each one stands',
            route: Routes.myListings),
        QuickAction(
            icon: Icons.build_circle_outlined,
            title: 'My repairs',
            subtitle: 'Quotes, pickups and repair progress',
            route: Routes.requests),
        QuickAction(
            icon: Icons.storefront_outlined,
            title: 'Marketplace',
            subtitle: 'Buy checked, repaired devices from verified sellers',
            route: Routes.shop),
        QuickAction(
            icon: Icons.shopping_bag_outlined,
            title: 'Orders',
            subtitle: 'What you ordered and where it is',
            route: Routes.orders),
        _wanted,
      ];
    case UserRole.technician:
      return const [
        QuickAction(
            icon: Icons.inbox_outlined,
            title: 'Find repair requests',
            subtitle: 'New requests that match your skills',
            route: Routes.jobsBoard),
        QuickAction(
            icon: Icons.work_outline,
            title: 'My repair jobs',
            subtitle: 'Quotes, updates and finishing jobs',
            route: Routes.jobsActive),
        _wanted,
      ];
    case UserRole.refurbisher:
      return const [
        QuickAction(
            icon: Icons.search_outlined,
            title: 'Requests',
            subtitle: 'Devices owners want refurbished, and your own wanted requests',
            route: Routes.refurbOpportunities),
        QuickAction(
            icon: Icons.storefront_outlined,
            title: 'Refurbished products',
            subtitle: 'List refurbished devices for sale',
            route: Routes.myProducts),
        QuickAction(
            icon: Icons.shopping_bag_outlined,
            title: 'Orders',
            subtitle: 'Orders you have received',
            route: Routes.orders),
      ];
    case UserRole.recycler:
      return const [
        QuickAction(
            icon: Icons.inbox_outlined,
            title: 'Recycling requests',
            subtitle: 'Devices waiting for collection',
            route: Routes.recyclingRequests),
        QuickAction(
            icon: Icons.bar_chart_outlined,
            title: 'Recycling report',
            subtitle: 'Requests and materials recovered, by period',
            route: Routes.recyclingReport),
      ];
    case UserRole.admin:
      return const [
        QuickAction(
            icon: Icons.admin_panel_settings_outlined,
            title: 'Administration',
            subtitle:
                'Moderation, verification and reports are on the web dashboard'),
      ];
  }
}

/// A short, honest line about where a provider's approval stands, or `null` when there is nothing to say.
String? verificationMessage(AppUser user, String? verificationStatus) {
  if (!user.role.isProvider) return null;
  switch (verificationStatus) {
    case 'approved':
      return null;
    case 'pending':
      return 'Your documents are being checked. You will be told as soon as an administrator decides.';
    case 'rejected':
      return 'Your verification was not approved. Open your account to see why and submit again.';
    case 'resubmission_required':
      return 'An administrator needs more from you. Open your account to see what to send.';
    default:
      return 'Submit your documents to be approved. Until then you cannot offer services.';
  }
}
