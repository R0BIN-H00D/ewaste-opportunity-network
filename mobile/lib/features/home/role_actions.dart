import 'package:material_ui/material_ui.dart';
import '../../models/user.dart';
import '../../routes/route_paths.dart';

/// One thing a person can do from the home screen. Screens for each are added slice by slice; until then they show "Soon".
class QuickAction {
  const QuickAction({required this.icon, required this.title, required this.subtitle, this.route});

  final IconData icon;
  final String title;
  final String subtitle;

  /// Where the tile goes. `null` while its screen has not been built yet (the tile then shows "Soon").
  final String? route;
}

/// The home screen's quick actions for a role. Mirrors the web dashboard's menu for that role.
List<QuickAction> actionsFor(UserRole role) {
  switch (role) {
    case UserRole.user:
      return const [
        QuickAction(icon: Icons.add_a_photo_outlined, title: 'List a device', subtitle: 'Photos, condition and what you want to do with it', route: Routes.newListing),
        QuickAction(icon: Icons.devices_other_outlined, title: 'My listings', subtitle: 'Devices you have listed and where they stand', route: Routes.myListings),
        QuickAction(icon: Icons.search, title: 'Browse devices', subtitle: 'See what others are offering near you', route: Routes.browse),
        QuickAction(icon: Icons.handyman_outlined, title: 'Find a technician', subtitle: 'Repairs from people near you', route: Routes.technicians),
        QuickAction(icon: Icons.build_circle_outlined, title: 'My requests', subtitle: 'Quotes, pickups and repair progress', route: Routes.requests),
        QuickAction(icon: Icons.recycling_outlined, title: 'Recycle', subtitle: 'Hand devices to a recycling centre'),
        QuickAction(icon: Icons.volunteer_activism_outlined, title: 'Donations and shop', subtitle: 'Give devices away or buy refurbished'),
      ];
    case UserRole.technician:
      return const [
        QuickAction(icon: Icons.inbox_outlined, title: 'Repair requests', subtitle: 'New requests that match your skills', route: Routes.jobsBoard),
        QuickAction(icon: Icons.work_outline, title: 'My jobs', subtitle: 'Quotes, updates and finishing jobs', route: Routes.jobsActive),
      ];
    case UserRole.student:
      return const [
        QuickAction(icon: Icons.school_outlined, title: 'Opportunities', subtitle: 'Supervised tasks you can join'),
        QuickAction(icon: Icons.assignment_turned_in_outlined, title: 'My applications', subtitle: 'Track what you applied for'),
        QuickAction(icon: Icons.workspace_premium_outlined, title: 'Certificates', subtitle: 'Earned when a task is completed'),
      ];
    case UserRole.refurbisher:
      return const [
        QuickAction(icon: Icons.build_circle_outlined, title: 'Refurbishment jobs', subtitle: 'Offers, repairs and finished work'),
        QuickAction(icon: Icons.storefront_outlined, title: 'My products', subtitle: 'List refurbished devices for sale'),
        QuickAction(icon: Icons.shopping_bag_outlined, title: 'Orders', subtitle: 'Orders you have received'),
      ];
    case UserRole.recycler:
      return const [
        QuickAction(icon: Icons.inbox_outlined, title: 'Recycling requests', subtitle: 'Devices waiting for collection'),
        QuickAction(icon: Icons.local_shipping_outlined, title: 'Pickups', subtitle: 'Scheduled collections'),
        QuickAction(icon: Icons.scale_outlined, title: 'Materials', subtitle: 'Record what you recovered, by weight'),
      ];
    case UserRole.admin:
      return const [
        QuickAction(icon: Icons.admin_panel_settings_outlined, title: 'Administration', subtitle: 'Moderation, verification and reports are on the web dashboard'),
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
