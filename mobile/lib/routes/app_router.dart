import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_controller.dart';
import '../models/user.dart';
import '../screens/admin/admin_analytics_page.dart';
import '../screens/admin/admin_catalog.dart';
import '../screens/admin/admin_dashboard.dart';
import '../screens/admin/admin_home.dart';
import '../screens/admin/admin_list_page.dart';
import '../screens/account/account_screen.dart';
import '../screens/account/help_screen.dart';
import '../screens/account/notifications_screen.dart';
import '../screens/account/payments_screen.dart';
import '../screens/account/profile_screen.dart';
import '../screens/account/settings_screen.dart';
import '../screens/account/verification_screen.dart';
import '../screens/activity_screen.dart';
import '../screens/donations/donation_details_screen.dart';
import '../models/chat.dart';
import '../screens/chat/chat_screen.dart';
import '../screens/chat/conversations_screen.dart';
import '../screens/impact/impact_screen.dart';
import '../screens/learn/learn_screens.dart';
import '../screens/pickups/pickups_screen.dart';
import '../screens/location/pin_picker_screen.dart';
import '../services/location_service.dart';
import '../screens/donations/donations_screen.dart';
import '../screens/donations/offer_donation_screen.dart';
import '../screens/donations/recipient_screen.dart';
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
import '../models/refurbishment.dart';
import '../models/wanted.dart';
import '../screens/refurbishment/refurb_offer_screen.dart';
import '../screens/wanted/wanted_screens.dart';
import '../screens/recycling/recycle_screen.dart';
import '../screens/recycling/recycling_details_screen.dart';
import '../screens/recycling/recycling_requests_screen.dart';
import '../screens/app_shell.dart';
import '../screens/tab_swipe.dart';
import '../screens/auth/forgot_password_screen.dart';
import '../screens/devices/device_details_screen.dart';
import '../screens/devices/device_pages.dart';
import '../screens/devices/new_listing_screen.dart';
import '../screens/auth/login_screen.dart';
import '../screens/auth/register_screen.dart';
import '../screens/auth/reset_password_screen.dart';
import '../screens/home/home_screen.dart';
import '../screens/onboarding_screen.dart';
import '../screens/requests/jobs_screen.dart';
import '../screens/requests/request_details_screen.dart';
import '../screens/requests/requests_screen.dart';
import '../screens/technicians/request_repair_screen.dart';
import '../screens/technicians/technician_details_screen.dart';
import '../screens/technicians/technicians_screen.dart';
import '../screens/splash_screen.dart';
import '../widgets/app_background.dart';
import 'route_paths.dart';

export 'route_paths.dart';

/// What a provider who is not verified yet may open. Everything else sends them to the verification screen.
const lockedAllowed = [Routes.verification, Routes.profile, Routes.account, Routes.settings, Routes.help];

/// Where to send a person who is at [location], or `null` to leave them there. A plain function so it can be tested.
String? redirectFor({
  required bool booted,
  required AuthStatus auth,
  required bool onboardingSeen,
  required String location,
  bool welcome = false, // just signed up: the first screen is their profile
  bool locked = false, // a provider whose documents are not approved yet
}) {
  // While the app starts up (reading storage, restoring the session) only the splash screen is shown.
  if (!booted || auth == AuthStatus.unknown) {
    return location == Routes.splash ? null : Routes.splash;
  }

  final isPublic = publicRoutes.contains(location);
  if (auth == AuthStatus.authenticated) {
    // Until an administrator approves them, a provider can only open the verification, profile, account and help screens.
    if (locked) return lockedAllowed.contains(location) ? null : Routes.verification;
    return (location == Routes.splash || isPublic) ? (welcome ? Routes.profile : Routes.home) : null;
  }

  // Signed out.
  if (location == Routes.splash) {
    return onboardingSeen ? Routes.login : Routes.onboarding;
  }
  return isPublic ? null : Routes.login;
}

final routerProvider = Provider<GoRouter>((ref) {
  // The router is created once; this tells it to re-run its redirect whenever sign-in or start-up state changes.
  final refresh = ValueNotifier<int>(0);
  ref.onDispose(refresh.dispose);
  ref.listen(authControllerProvider, (_, __) => refresh.value++);
  ref.listen(onboardingProvider, (_, __) => refresh.value++);
  ref.listen(bootProvider, (_, __) => refresh.value++);
  final signedInObserver = _SignedInNavigatorObserver();

  final router = GoRouter(
    initialLocation: Routes.splash,
    refreshListenable: refresh,
    redirect: (context, state) => redirectFor(
      booted: !ref.read(bootProvider).isLoading,
      auth: ref.read(authControllerProvider).status,
      onboardingSeen: ref.read(onboardingProvider),
      location: state.matchedLocation,
      welcome: ref.read(authControllerProvider).justRegistered,
      locked: ref.read(authControllerProvider).me?.isLocked ?? false,
    ),
    routes: [
      GoRoute(path: Routes.splash, builder: (_, __) => const SplashScreen()),
      GoRoute(
          path: Routes.onboarding,
          builder: (_, __) => const OnboardingScreen()),
      GoRoute(path: Routes.login, builder: (_, __) => const LoginScreen()),
      GoRoute(
          path: Routes.register, builder: (_, __) => const RegisterScreen()),
      GoRoute(
          path: Routes.forgotPassword,
          builder: (_, __) => const ForgotPasswordScreen()),
      GoRoute(
          path: Routes.resetPassword,
          builder: (_, __) => const ResetPasswordScreen()),
      // All signed-in destinations share the bottom bar, including pushed pages.
      ShellRoute(
        observers: [signedInObserver],
        builder: (_, state, child) => AppShell(
          location: state.uri.path,
          canChangeTab: () => signedInObserver.canChangeTab,
          child: child,
        ),
        routes: [
          GoRoute(
            path: Routes.admin,
            redirect: (_, __) => ref.read(authControllerProvider).me?.user.role == UserRole.admin ? null : Routes.home,
            builder: (_, __) => const AdminDashboard(),
            routes: [
              GoRoute(
                path: 'groups/:group',
                redirect: (_, state) => AdminHomeGroup.values.any((group) => group.name == state.pathParameters['group']) ? null : Routes.admin,
                builder: (_, state) => AdminHomeGroupPage(group: AdminHomeGroup.values.byName(state.pathParameters['group']!)),
              ),
              GoRoute(
                path: ':tool',
                redirect: (_, state) => AdminSection.values.any((section) => section.name == state.pathParameters['tool']) ? null : Routes.admin,
                builder: (_, state) {
                  final section = AdminSection.values.byName(state.pathParameters['tool']!);
                  return section == AdminSection.analytics
                      ? const AdminAnalyticsPage()
                      : AdminListPage(section: section, initial: state.uri.queryParameters);
                },
              ),
            ],
          ),
          GoRoute(path: Routes.browse, builder: (_, __) => const BrowsePage()),
          GoRoute(
              path: Routes.myListings, builder: (_, __) => const MyListingsPage()),
          GoRoute(path: Routes.impact, builder: (_, __) => const ImpactPage()),
          GoRoute(path: Routes.pickups, builder: (_, __) => const PickupsPage()),
          GoRoute(path: Routes.learn, builder: (_, __) => const LearnPage()),
          GoRoute(
              path: Routes.articlePattern,
              builder: (_, state) =>
                  ArticleScreen(slug: state.pathParameters['slug']!)),
          GoRoute(
              path: Routes.messages, builder: (_, __) => const ConversationsPage()),
          GoRoute(
            path: Routes.messagePattern,
            builder: (_, state) => ChatPage(
                conversationId: state.pathParameters['id']!,
                conversation: state.extra is Conversation
                    ? state.extra as Conversation
                    : null),
          ),
          GoRoute(
              path: Routes.newListing,
              builder: (_, __) => const NewListingScreen()),
          GoRoute(
              path: Routes.pickLocation,
              builder: (_, state) => PinPickerScreen(
                  initial:
                      state.extra is GeoPoint ? state.extra as GeoPoint : null)),
          GoRoute(
              path: Routes.listingPattern,
              builder: (_, state) =>
                  DeviceDetailsScreen(id: state.pathParameters['id']!)),
          GoRoute(
              path: Routes.technicians,
              builder: (_, state) =>
                  TechniciansPage(listingId: state.uri.queryParameters['listing'])),
          GoRoute(
            path: Routes.technicianPattern,
            builder: (_, state) => TechnicianDetailsScreen(
                id: state.pathParameters['id']!,
                listingId: state.uri.queryParameters['listing']),
          ),
          // "/requests/new" must come before "/requests/:id", or "new" would be read as an id.
          GoRoute(
            path: Routes.newRequest,
            builder: (_, state) => RequestRepairScreen(
                listingId: state.uri.queryParameters['listing'],
                technicianId: state.uri.queryParameters['technician']),
          ),
          GoRoute(path: Routes.requests, builder: (_, __) => const RequestsPage()),
          // The old "/jobs?tab=..." address goes to whichever of the two pages it meant.
          GoRoute(
            path: Routes.jobs,
            redirect: (_, state) => const ['active', 'all'].contains(state.uri.queryParameters['tab']) ? Routes.jobsActive : Routes.jobsBoard,
            builder: (_, __) => const SizedBox.shrink(),
          ),
          GoRoute(path: Routes.jobsBoard, builder: (_, __) => const FindRequestsPage()),
          GoRoute(path: Routes.jobsActive, builder: (_, __) => const MyJobsPage()),
          GoRoute(
              path: Routes.requestPattern,
              builder: (_, state) =>
                  RequestDetailsScreen(id: state.pathParameters['id']!)),
          GoRoute(path: Routes.profile, builder: (_, __) => const ProfilePage()),
          GoRoute(path: Routes.settings, builder: (_, __) => const SettingsPage()),
          GoRoute(
              path: Routes.notifications,
              builder: (_, __) => const NotificationsPage()),
          GoRoute(path: Routes.help, builder: (_, __) => const HelpPage()),
          GoRoute(
              path: Routes.verification,
              builder: (_, __) => const VerificationPage()),
          GoRoute(
              path: Routes.donations,
              builder: (_, state) => DonationsPage(
                  initialScope: state.uri.queryParameters['as'] ?? '')),
          GoRoute(
              path: Routes.newDonation,
              builder: (_, state) => OfferDonationScreen(
                  listingId: state.uri.queryParameters['listing'] ?? '')),
          GoRoute(
              path: Routes.donationPattern,
              builder: (_, state) =>
                  DonationDetailsScreen(id: state.pathParameters['id']!)),
          GoRoute(
              path: Routes.recipient, builder: (_, __) => const RecipientScreen()),
          GoRoute(
              path: Routes.recyclingReport,
              redirect: (_, __) => ref.read(authControllerProvider).user?.role == UserRole.recycler ? null : Routes.home,
              builder: (_, __) => const RecyclingReportScreen()),
          GoRoute(path: Routes.wanted, builder: (_, __) => const WantedPage()),
          GoRoute(
            path: Routes.wantedAcceptPattern,
            redirect: (_, state) => state.extra is WantedRequest ? null : Routes.wanted,
            builder: (_, state) => WantedAcceptScreen(request: state.extra! as WantedRequest),
          ),
          GoRoute(
            path: Routes.refurbOfferPattern,
            redirect: (_, state) => state.extra is RefurbOpportunity ? null : Routes.refurbOpportunities,
            builder: (_, state) => RefurbOfferScreen(opportunity: state.extra! as RefurbOpportunity),
          ),
          GoRoute(
              path: Routes.refurbOpportunities,
              builder: (_, __) => const RefurbOpportunitiesPage()),
          GoRoute(
              path: Routes.refurbJobs,
              builder: (_, state) => RefurbJobsPage(
                  initialStatus: state.uri.queryParameters['status'] ?? '')),
          GoRoute(
              path: Routes.refurbJobPattern,
              builder: (_, state) =>
                  RefurbJobDetailsScreen(id: state.pathParameters['id']!)),
          GoRoute(
              path: Routes.myProducts, builder: (_, __) => const MyProductsPage()),
          GoRoute(
              path: Routes.newProduct,
              builder: (_, state) =>
                  ProductFormScreen(jobId: state.uri.queryParameters['job'])),
          GoRoute(
              path: Routes.editProductPattern,
              builder: (_, state) =>
                  ProductFormScreen(productId: state.pathParameters['id']!)),
          GoRoute(path: Routes.shop, builder: (_, __) => const MarketplacePage()),
          GoRoute(
              path: Routes.productPattern,
              builder: (_, state) =>
                  ProductDetailsScreen(id: state.pathParameters['id']!)),
          GoRoute(
              path: Routes.orders,
              builder: (_, state) => OrdersPage(
                  initialStatus: state.uri.queryParameters['status'] ?? '')),
          GoRoute(
              path: Routes.orderPattern,
              builder: (_, state) =>
                  OrderDetailsScreen(id: state.pathParameters['id']!)),
          GoRoute(
              path: Routes.recycling,
              builder: (_, state) =>
                  CentersPage(listingId: state.uri.queryParameters['listing'])),
          GoRoute(
              path: Routes.centerPattern,
              builder: (_, state) => CenterDetailsScreen(
                  id: state.pathParameters['id']!,
                  listingId: state.uri.queryParameters['listing'])),
          GoRoute(
            path: Routes.newRecycling,
            builder: (_, state) => RecycleScreen(
                centerId: state.uri.queryParameters['center'] ?? '',
                listingId: state.uri.queryParameters['listing']),
          ),
          GoRoute(
              path: Routes.recyclingRequests,
              builder: (_, state) => RecyclingRequestsPage(
                  initialStatus: state.uri.queryParameters['status'] ?? '')),
          GoRoute(
              path: Routes.recyclingRequestPattern,
              builder: (_, state) =>
                  RecyclingDetailsScreen(id: state.pathParameters['id']!)),
          // Only the tab roots swipe. The parent shell also shows the bar on detail pages.
          StatefulShellRoute(
            builder: (_, __, shell) => SafeArea(
              bottom: false,
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: maxContentWidth),
                  child: SizedBox.expand(child: shell),
                ),
              ),
            ),
            navigatorContainerBuilder: (_, shell, pages) => TabSwipeContainer(navigationShell: shell, children: pages),
            branches: [
              StatefulShellBranch(routes: [
                GoRoute(path: Routes.home, builder: (_, __) => const HomeScreen())
              ]),
              StatefulShellBranch(routes: [
                GoRoute(
                  path: Routes.payments,
                  builder: (_, __) => ref.read(authControllerProvider).user?.role == UserRole.admin
                      ? const AdminHomeGroupPage(group: AdminHomeGroup.administration, inTab: true)
                      : const PaymentsPage(),
                ),
              ]),
              StatefulShellBranch(routes: [
                GoRoute(
                  path: Routes.activity,
                  builder: (_, __) => ref.read(authControllerProvider).user?.role == UserRole.admin
                      ? const AdminListPage(section: AdminSection.complaints, initial: {'status': 'active'}, inTab: true)
                      : const ActivityScreen(),
                ),
              ]),
              StatefulShellBranch(routes: [
                GoRoute(path: Routes.account, builder: (_, __) => const AccountScreen())
              ]),
            ],
          ),
        ],
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});

class _SignedInNavigatorObserver extends NavigatorObserver {
  Route<dynamic>? _top;

  bool get canChangeTab => _top is! PopupRoute && _top?.popDisposition != RoutePopDisposition.doNotPop;

  @override
  void didChangeTop(Route<dynamic> topRoute, Route<dynamic>? previousTopRoute) {
    _top = topRoute;
  }
}
