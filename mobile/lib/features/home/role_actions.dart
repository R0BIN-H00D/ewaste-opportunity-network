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

const _messages = QuickAction(icon: Icons.chat_bubble_outline, title: 'Messages', subtitle: 'Talk to the people you are working with', route: Routes.messages);

const _learn = QuickAction(icon: Icons.menu_book_outlined, title: 'Learning centre', subtitle: 'Guides on safe disposal, repair and protecting your data', route: Routes.learn);

const _pickups = QuickAction(icon: Icons.event_available_outlined, title: 'My pickups', subtitle: 'Collections and handovers, and when they are', route: Routes.pickups);

/// The home screen's quick actions for a role. Mirrors the web dashboard's menu for that role, with Pickups and Messages last for everyone who has them.
List<QuickAction> actionsFor(UserRole role) => [..._roleActions(role), if (role != UserRole.admin) ...[_pickups, _messages, _learn]];

List<QuickAction> _roleActions(UserRole role) {
  switch (role) {
    case UserRole.user:
      return const [
        QuickAction(icon: Icons.add_a_photo_outlined, title: 'List a device', subtitle: 'Photos, condition and what you want to do with it', route: Routes.newListing),
        QuickAction(icon: Icons.devices_other_outlined, title: 'My listings', subtitle: 'Devices you have listed and where they stand', route: Routes.myListings),
        QuickAction(icon: Icons.search, title: 'Browse devices', subtitle: 'See what others are offering near you', route: Routes.browse),
        QuickAction(icon: Icons.handyman_outlined, title: 'Find a technician', subtitle: 'Repairs from people near you', route: Routes.technicians),
        QuickAction(icon: Icons.build_circle_outlined, title: 'My requests', subtitle: 'Quotes, pickups and repair progress', route: Routes.requests),
        QuickAction(icon: Icons.recycling_outlined, title: 'Recycle', subtitle: 'Hand devices to a recycling centre', route: Routes.recycling),
        QuickAction(icon: Icons.local_shipping_outlined, title: 'My recycling', subtitle: 'Pickups and what happened to your devices', route: Routes.recyclingRequests),
        QuickAction(icon: Icons.storefront_outlined, title: 'Refurbished shop', subtitle: 'Buy checked, repaired devices from verified sellers', route: Routes.shop),
        QuickAction(icon: Icons.shopping_bag_outlined, title: 'My orders', subtitle: 'What you ordered and where it is', route: Routes.orders),
        QuickAction(icon: Icons.volunteer_activism_outlined, title: 'Donations', subtitle: 'Give devices away or ask for one', route: Routes.donations),
        QuickAction(icon: Icons.card_giftcard_outlined, title: 'My donations', subtitle: 'Devices you offered and who asked for them', route: Routes.myDonations),
      ];
    case UserRole.technician:
      return const [
        QuickAction(icon: Icons.inbox_outlined, title: 'Repair requests', subtitle: 'New requests that match your skills', route: Routes.jobsBoard),
        QuickAction(icon: Icons.work_outline, title: 'My jobs', subtitle: 'Quotes, updates and finishing jobs', route: Routes.jobsActive),
        QuickAction(icon: Icons.school_outlined, title: 'Student tasks', subtitle: 'Post supervised tasks and review applicants', route: Routes.myTasks),
      ];
    case UserRole.student:
      return const [
        QuickAction(icon: Icons.school_outlined, title: 'Opportunities', subtitle: 'Supervised tasks you can join', route: Routes.opportunities),
        QuickAction(icon: Icons.assignment_turned_in_outlined, title: 'My applications', subtitle: 'Track what you applied for', route: Routes.applications),
        QuickAction(icon: Icons.workspace_premium_outlined, title: 'Certificates', subtitle: 'Earned when a task is completed', route: Routes.experience),
      ];
    case UserRole.refurbisher:
      return const [
        QuickAction(icon: Icons.search_outlined, title: 'Devices to refurbish', subtitle: 'Owners looking for a refurbisher', route: Routes.refurbOpportunities),
        QuickAction(icon: Icons.build_circle_outlined, title: 'Refurbishment jobs', subtitle: 'Offers, repairs and finished work', route: Routes.refurbJobs),
        QuickAction(icon: Icons.storefront_outlined, title: 'My products', subtitle: 'List refurbished devices for sale', route: Routes.myProducts),
        QuickAction(icon: Icons.shopping_bag_outlined, title: 'Orders', subtitle: 'Orders you have received', route: Routes.orders),
      ];
    case UserRole.recycler:
      return const [
        QuickAction(icon: Icons.inbox_outlined, title: 'Recycling requests', subtitle: 'Devices waiting for collection', route: Routes.recyclingRequests),
        QuickAction(icon: Icons.local_shipping_outlined, title: 'Pickups', subtitle: 'Scheduled collections', route: '${Routes.recyclingRequests}?status=pickup_scheduled'),
        QuickAction(icon: Icons.bar_chart_outlined, title: 'Activity report', subtitle: 'Requests and materials recovered, by period', route: Routes.recyclingReport),
        QuickAction(icon: Icons.scale_outlined, title: 'Materials', subtitle: 'Record what you recovered, by weight', route: '${Routes.recyclingRequests}?status=received_at_center'),
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
