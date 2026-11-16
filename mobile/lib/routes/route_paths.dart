/// Every screen address in one place, with no imports, so screens and the router can both use it without a cycle.
abstract class Routes {
  static const splash = '/';
  static const onboarding = '/onboarding';
  static const login = '/login';
  static const register = '/register';
  static const forgotPassword = '/forgot-password';
  static const resetPassword = '/reset-password';
  static const home = '/home';
  static const account = '/account';
  static const profile = '/account/profile';
  static const settings = '/account/settings';
  static const notifications = '/account/notifications';
  static const payments = '/account/payments';
  static const help = '/account/help';
  static const browse = '/browse';
  static const myListings = '/my-listings';
  static const newListing = '/listings/new';
  static const listingPattern = '/devices/:id';
  static String listing(String id) => '/devices/$id';
  static const technicians = '/technicians';
  static const technicianPattern = '/technicians/:id';
  static const newRequest = '/requests/new';
  static const requests = '/requests';
  static const requestPattern = '/requests/:id';

  /// The technician directory. [listing] is the device the person wants repaired, carried along to the request form.
  static String techniciansFor({String? listing}) => listing == null ? technicians : '$technicians?listing=$listing';
  static String technician(String id, {String? listing}) => listing == null ? '$technicians/$id' : '$technicians/$id?listing=$listing';

  /// The request form. [technician] asks one technician; leave it out for an open request any suitable technician can take.
  static String requestRepair({String? listing, String? technician}) {
    final params = [if (listing != null) 'listing=$listing', if (technician != null) 'technician=$technician'];
    return params.isEmpty ? newRequest : '$newRequest?${params.join('&')}';
  }

  static String request(String id) => '$requests/$id';
}

/// Screens a signed-out person can open. Everything else needs a signed-in session.
const publicRoutes = {Routes.onboarding, Routes.login, Routes.register, Routes.forgotPassword, Routes.resetPassword};
