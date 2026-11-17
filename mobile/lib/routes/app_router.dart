import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_controller.dart';
import '../screens/account/account_screen.dart';
import '../screens/account/help_screen.dart';
import '../screens/account/notifications_screen.dart';
import '../screens/account/payments_screen.dart';
import '../screens/account/profile_screen.dart';
import '../screens/account/settings_screen.dart';
import '../screens/account/verification_screen.dart';
import '../screens/donations/donation_details_screen.dart';
import '../models/chat.dart';
import '../screens/chat/chat_screen.dart';
import '../screens/chat/conversations_screen.dart';
import '../screens/impact/impact_screen.dart';
import '../screens/pickups/pickups_screen.dart';
import '../screens/location/pin_picker_screen.dart';
import '../services/location_service.dart';
import '../screens/donations/donations_screen.dart';
import '../screens/donations/offer_donation_screen.dart';
import '../screens/donations/recipient_screen.dart';
import '../screens/learning/applicants_screen.dart';
import '../screens/learning/my_tasks_screen.dart';
import '../screens/learning/opportunity_form_screen.dart';
import '../screens/learning/application_details_screen.dart';
import '../screens/learning/applications_screen.dart';
import '../screens/learning/experience_screen.dart';
import '../screens/learning/opportunities_screen.dart';
import '../screens/learning/opportunity_details_screen.dart';
import '../screens/marketplace/marketplace_screen.dart';
import '../screens/marketplace/order_details_screen.dart';
import '../screens/marketplace/orders_screen.dart';
import '../screens/marketplace/product_details_screen.dart';
import '../screens/recycling/center_details_screen.dart';
import '../screens/recycling/centers_screen.dart';
import '../screens/recycling/recycling_report_screen.dart';
import '../screens/refurbishment/my_products_screen.dart';
import '../screens/refurbishment/product_form_screen.dart';
import '../screens/refurbishment/refurb_job_details_screen.dart';
import '../screens/refurbishment/refurb_jobs_screen.dart';
import '../screens/refurbishment/refurb_opportunities_screen.dart';
import '../screens/recycling/recycle_screen.dart';
import '../screens/recycling/recycling_details_screen.dart';
import '../screens/recycling/recycling_requests_screen.dart';
import '../screens/app_shell.dart';
import '../screens/auth/forgot_password_screen.dart';
import '../screens/devices/device_details_screen.dart';
import '../screens/devices/device_pages.dart';
import '../screens/devices/new_listing_screen.dart';
import '../screens/auth/login_screen.dart';
import '../screens/auth/register_screen.dart';
import '../screens/auth/reset_password_screen.dart';
import '../screens/home/home_screen.dart';
import '../screens/onboarding_screen.dart';
import '../providers/technicians_controller.dart';
import '../screens/requests/jobs_screen.dart';
import '../screens/requests/request_details_screen.dart';
import '../screens/requests/requests_screen.dart';
import '../screens/technicians/request_repair_screen.dart';
import '../screens/technicians/technician_details_screen.dart';
import '../screens/technicians/technicians_screen.dart';
import '../screens/splash_screen.dart';
import 'route_paths.dart';

export 'route_paths.dart';

/// Where to send a person who is at [location], or `null` to leave them there. A plain function so it can be tested.
String? redirectFor({
  required bool booted,
  required AuthStatus auth,
  required bool onboardingSeen,
  required String location,
}) {
  // While the app starts up (reading storage, restoring the session) only the splash screen is shown.
  if (!booted || auth == AuthStatus.unknown) return location == Routes.splash ? null : Routes.splash;

  final isPublic = publicRoutes.contains(location);
  if (auth == AuthStatus.authenticated) {
    return (location == Routes.splash || isPublic) ? Routes.home : null;
  }

  // Signed out.
  if (location == Routes.splash) return onboardingSeen ? Routes.login : Routes.onboarding;
  return isPublic ? null : Routes.login;
}

final routerProvider = Provider<GoRouter>((ref) {
  // The router is created once; this tells it to re-run its redirect whenever sign-in or start-up state changes.
  final refresh = ValueNotifier<int>(0);
  ref.onDispose(refresh.dispose);
  ref.listen(authControllerProvider, (_, __) => refresh.value++);
  ref.listen(onboardingProvider, (_, __) => refresh.value++);
  ref.listen(bootProvider, (_, __) => refresh.value++);

  final router = GoRouter(
    initialLocation: Routes.splash,
    refreshListenable: refresh,
    redirect: (context, state) => redirectFor(
      booted: !ref.read(bootProvider).isLoading,
      auth: ref.read(authControllerProvider).status,
      onboardingSeen: ref.read(onboardingProvider),
      location: state.matchedLocation,
    ),
    routes: [
      GoRoute(path: Routes.splash, builder: (_, __) => const SplashScreen()),
      GoRoute(path: Routes.onboarding, builder: (_, __) => const OnboardingScreen()),
      GoRoute(path: Routes.login, builder: (_, __) => const LoginScreen()),
      GoRoute(path: Routes.register, builder: (_, __) => const RegisterScreen()),
      GoRoute(path: Routes.forgotPassword, builder: (_, __) => const ForgotPasswordScreen()),
      GoRoute(path: Routes.resetPassword, builder: (_, __) => const ResetPasswordScreen()),
      // Full-screen pages opened on top of the bottom bar. They need a signed-in person like everything not listed as public.
      GoRoute(path: Routes.browse, builder: (_, __) => const BrowsePage()),
      GoRoute(path: Routes.myListings, builder: (_, __) => const MyListingsPage()),
      GoRoute(path: Routes.impact, builder: (_, __) => const ImpactPage()),
      GoRoute(path: Routes.pickups, builder: (_, __) => const PickupsPage()),
      GoRoute(path: Routes.messages, builder: (_, __) => const ConversationsPage()),
      GoRoute(
        path: Routes.messagePattern,
        builder: (_, state) => ChatPage(conversationId: state.pathParameters['id']!, conversation: state.extra is Conversation ? state.extra as Conversation : null),
      ),
      GoRoute(path: Routes.newListing, builder: (_, __) => const NewListingScreen()),
      GoRoute(path: Routes.pickLocation, builder: (_, state) => PinPickerScreen(initial: state.extra is GeoPoint ? state.extra as GeoPoint : null)),
      GoRoute(path: Routes.listingPattern, builder: (_, state) => DeviceDetailsScreen(id: state.pathParameters['id']!)),
      GoRoute(path: Routes.technicians, builder: (_, state) => TechniciansPage(listingId: state.uri.queryParameters['listing'])),
      GoRoute(
        path: Routes.technicianPattern,
        builder: (_, state) => TechnicianDetailsScreen(id: state.pathParameters['id']!, listingId: state.uri.queryParameters['listing']),
      ),
      // "/requests/new" must come before "/requests/:id", or "new" would be read as an id.
      GoRoute(
        path: Routes.newRequest,
        builder: (_, state) => RequestRepairScreen(listingId: state.uri.queryParameters['listing'], technicianId: state.uri.queryParameters['technician']),
      ),
      GoRoute(path: Routes.requests, builder: (_, __) => const RequestsPage()),
      GoRoute(
        path: Routes.jobs,
        builder: (_, state) => JobsPage(initial: JobsFilter.values.firstWhere((f) => f.name == state.uri.queryParameters['tab'], orElse: () => JobsFilter.board)),
      ),
      GoRoute(path: Routes.requestPattern, builder: (_, state) => RequestDetailsScreen(id: state.pathParameters['id']!)),
      GoRoute(path: Routes.profile, builder: (_, __) => const ProfilePage()),
      GoRoute(path: Routes.settings, builder: (_, __) => const SettingsPage()),
      GoRoute(path: Routes.notifications, builder: (_, __) => const NotificationsPage()),
      GoRoute(path: Routes.payments, builder: (_, __) => const PaymentsPage()),
      GoRoute(path: Routes.help, builder: (_, __) => const HelpPage()),
      GoRoute(path: Routes.verification, builder: (_, __) => const VerificationPage()),
      GoRoute(path: Routes.donations, builder: (_, state) => DonationsPage(initialScope: state.uri.queryParameters['as'] ?? '')),
      GoRoute(path: Routes.newDonation, builder: (_, state) => OfferDonationScreen(listingId: state.uri.queryParameters['listing'] ?? '')),
      GoRoute(path: Routes.donationPattern, builder: (_, state) => DonationDetailsScreen(id: state.pathParameters['id']!)),
      GoRoute(path: Routes.recipient, builder: (_, __) => const RecipientScreen()),
      GoRoute(path: Routes.opportunities, builder: (_, __) => const OpportunitiesPage()),
      GoRoute(path: Routes.myTasks, builder: (_, __) => const MyTasksPage()),
      GoRoute(path: Routes.newTask, builder: (_, __) => const OpportunityFormScreen()),
      GoRoute(path: Routes.taskEditPattern, builder: (_, state) => OpportunityFormScreen(opportunityId: state.pathParameters['id']!)),
      GoRoute(path: Routes.applicantsPattern, builder: (_, state) => ApplicantsScreen(opportunityId: state.pathParameters['id']!)),
      GoRoute(path: Routes.opportunityPattern, builder: (_, state) => OpportunityDetailsScreen(id: state.pathParameters['id']!)),
      GoRoute(path: Routes.applications, builder: (_, state) => ApplicationsPage(initialStatus: state.uri.queryParameters['status'] ?? '')),
      GoRoute(path: Routes.applicationPattern, builder: (_, state) => ApplicationDetailsScreen(id: state.pathParameters['id']!)),
      GoRoute(path: Routes.experience, builder: (_, __) => const ExperienceScreen()),
      GoRoute(path: Routes.recyclingReport, builder: (_, __) => const RecyclingReportScreen()),
      GoRoute(path: Routes.refurbOpportunities, builder: (_, __) => const RefurbOpportunitiesPage()),
      GoRoute(path: Routes.refurbJobs, builder: (_, state) => RefurbJobsPage(initialStatus: state.uri.queryParameters['status'] ?? '')),
      GoRoute(path: Routes.refurbJobPattern, builder: (_, state) => RefurbJobDetailsScreen(id: state.pathParameters['id']!)),
      GoRoute(path: Routes.myProducts, builder: (_, __) => const MyProductsPage()),
      GoRoute(path: Routes.newProduct, builder: (_, state) => ProductFormScreen(jobId: state.uri.queryParameters['job'])),
      GoRoute(path: Routes.editProductPattern, builder: (_, state) => ProductFormScreen(productId: state.pathParameters['id']!)),
      GoRoute(path: Routes.shop, builder: (_, __) => const MarketplacePage()),
      GoRoute(path: Routes.productPattern, builder: (_, state) => ProductDetailsScreen(id: state.pathParameters['id']!)),
      GoRoute(path: Routes.orders, builder: (_, state) => OrdersPage(initialStatus: state.uri.queryParameters['status'] ?? '')),
      GoRoute(path: Routes.orderPattern, builder: (_, state) => OrderDetailsScreen(id: state.pathParameters['id']!)),
      GoRoute(path: Routes.recycling, builder: (_, state) => CentersPage(listingId: state.uri.queryParameters['listing'])),
      GoRoute(path: Routes.centerPattern, builder: (_, state) => CenterDetailsScreen(id: state.pathParameters['id']!, listingId: state.uri.queryParameters['listing'])),
      GoRoute(
        path: Routes.newRecycling,
        builder: (_, state) => RecycleScreen(centerId: state.uri.queryParameters['center'] ?? '', listingId: state.uri.queryParameters['listing']),
      ),
      GoRoute(path: Routes.recyclingRequests, builder: (_, state) => RecyclingRequestsPage(initialStatus: state.uri.queryParameters['status'] ?? '')),
      GoRoute(path: Routes.recyclingRequestPattern, builder: (_, state) => RecyclingDetailsScreen(id: state.pathParameters['id']!)),
      // The signed-in app: one shell with a floating glass bottom bar. Role-specific tabs are added with each role's screens.
      StatefulShellRoute.indexedStack(
        builder: (_, __, shell) => AppShell(navigationShell: shell),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: Routes.home, builder: (_, __) => const HomeScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: Routes.account, builder: (_, __) => const AccountScreen())]),
        ],
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});
