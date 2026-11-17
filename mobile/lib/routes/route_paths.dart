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
  static const verification = '/account/verification';
  static const browse = '/browse';
  static const myListings = '/my-listings';
  static const newListing = '/listings/new';

  /// A full-screen map to drop a pin on. Pops with the chosen point; the current point may be passed as `extra`.
  static const pickLocation = '/pick-location';
  static const listingPattern = '/devices/:id';
  static String listing(String id) => '/devices/$id';
  static const technicians = '/technicians';
  static const technicianPattern = '/technicians/:id';
  static const newRequest = '/requests/new';
  static const jobs = '/jobs';

  /// A technician's jobs opened on one tab: `board` (new requests), `active` (in progress) or `all`.
  static const jobsBoard = '$jobs?tab=board';
  static const jobsActive = '$jobs?tab=active';
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

  /// The refurbished shop and the orders placed on it (as buyer, or as seller for a refurbisher).
  static const shop = '/shop';
  static const productPattern = '/shop/:id';
  static String product(String id) => '$shop/$id';
  static const orders = '/orders';
  static const orderPattern = '/orders/:id';
  static String ordersWith(String status) => '$orders?status=$status';
  static String order(String id) => '$orders/$id';

  /// Student learning tasks: the open tasks, one task, the student's applications, one application, and experience with certificates.
  static const opportunities = '/learning';
  static const opportunityPattern = '/learning/:id';
  static String opportunity(String id) => '$opportunities/$id';
  static const myTasks = '/learning/mine';
  static const newTask = '/learning/new';
  static const taskEditPattern = '/learning/:id/edit';
  static String taskEdit(String id) => '$opportunities/$id/edit';
  static const applicantsPattern = '/learning/:id/applicants';
  static String applicants(String id) => '$opportunities/$id/applicants';
  static const applications = '/applications';
  static const applicationPattern = '/applications/:id';
  static String application(String id) => '$applications/$id';
  static const experience = '/experience';

  /// Donations: the marketplace and the person's own lists, one donation, offering a device, and registering an organisation to receive.
  static const donations = '/donations';
  static const donationPattern = '/donations/:id';
  static String donation(String id) => '$donations/$id';
  static const newDonation = '/donations/new';
  static String offerDonation(String listing) => '$newDonation?listing=$listing';
  static String donationsWith(String scope) => '$donations?as=$scope';
  static const myDonations = '/donations?as=donor';
  static const recipient = '/account/recipient';

  /// Refurbishment: the feed of devices to refurbish, the jobs, and the refurbisher's own products.
  static const refurbOpportunities = '/refurbish';
  static const refurbJobs = '/refurbish/jobs';
  static const refurbJobPattern = '/refurbish/jobs/:id';
  static String refurbJob(String id) => '$refurbJobs/$id';
  static String refurbJobsWith(String status) => '$refurbJobs?status=$status';
  static const myProducts = '/my-products';
  static const newProduct = '/my-products/new';
  static String newProductFor(String job) => '$newProduct?job=$job';
  static const editProductPattern = '/my-products/:id/edit';
  static String editProduct(String id) => '$myProducts/$id/edit';

  /// Recycling: the directory of centres, the form that sends devices to one, and the requests (sent or received).
  static const recycling = '/recycling/centres';
  static const centerPattern = '/recycling/centres/:id';
  static const newRecycling = '/recycling/new';
  static const recyclingRequests = '/recycling/requests';
  static const recyclingReport = '/recycling/report';
  static const recyclingRequestPattern = '/recycling/requests/:id';

  /// The directory. [listing] is the device the person wants to recycle, carried along to the request form.
  static String centersFor({String? listing}) => listing == null ? recycling : '$recycling?listing=$listing';
  static String center(String id, {String? listing}) => listing == null ? '$recycling/$id' : '$recycling/$id?listing=$listing';
  static String recycle({required String center, String? listing}) => listing == null ? '$newRecycling?center=$center' : '$newRecycling?center=$center&listing=$listing';

  /// The recycling requests, optionally opened on one status (`requested`, `pickup_scheduled`, ...).
  static String recyclingRequestsWith(String status) => '$recyclingRequests?status=$status';
  static String recyclingRequest(String id) => '$recyclingRequests/$id';
}

/// Screens a signed-out person can open. Everything else needs a signed-in session.
const publicRoutes = {Routes.onboarding, Routes.login, Routes.register, Routes.forgotPassword, Routes.resetPassword};
