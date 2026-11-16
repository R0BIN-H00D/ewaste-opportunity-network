import 'constants/app_constants.dart';

/// Labels for the fixed values the API uses. They mirror `backend/src/config/constants.js` and the web app's `lib/devices.js`.
typedef LabelPairs = List<(String, String)>;

const LabelPairs conditions = [
  ('fully_working', 'Fully working'),
  ('minor_damage', 'Minor damage'),
  ('major_damage', 'Major damage'),
  ('not_working', 'Not working'),
  ('for_spare_parts', 'For spare parts'),
];

const LabelPairs services = [
  ('repair', 'Repair'),
  ('reuse', 'Reuse'),
  ('donation', 'Donation'),
  ('refurbishment', 'Refurbishment'),
  ('recycling', 'Recycling'),
];

const LabelPairs pickups = [
  ('pickup', 'Pickup from my place'),
  ('drop_off', 'I can drop it off'),
  ('either', 'Either works'),
];

const LabelPairs sorts = [
  ('newest', 'Newest first'),
  ('oldest', 'Oldest first'),
  ('price_asc', 'Price: low to high'),
  ('price_desc', 'Price: high to low'),
];

const Map<String, String> listingStatusLabels = {
  'draft': 'Draft',
  'listed': 'Listed',
  'in_service': 'In service',
  'completed': 'Completed',
  'withdrawn': 'Withdrawn',
  'removed_by_admin': 'Removed by admin',
};

/// The label for [value], or the value itself when it is not one we know (a newer server may send more).
String labelOf(LabelPairs pairs, String? value) {
  if (value == null) return '';
  for (final (key, label) in pairs) {
    if (key == value) return label;
  }
  return value;
}

/// Rupees with Indian digit grouping (12,34,567). `null` means the owner gave no price, `0` means free.
String formatPrice(num? value) {
  if (value == null) return 'Price on request';
  if (value == 0) return 'Free';
  final whole = value.round();
  final digits = whole.abs().toString();
  String grouped;
  if (digits.length <= 3) {
    grouped = digits;
  } else {
    final lastThree = digits.substring(digits.length - 3);
    var rest = digits.substring(0, digits.length - 3);
    final groups = <String>[];
    while (rest.length > 2) {
      groups.insert(0, rest.substring(rest.length - 2));
      rest = rest.substring(0, rest.length - 2);
    }
    if (rest.isNotEmpty) groups.insert(0, rest);
    grouped = '${groups.join(',')},$lastThree';
  }
  return '₹${whole < 0 ? '-' : ''}$grouped';
}

/// Turns a path the API returned (`/uploads/devices/a.jpg`) into an address the phone can load.
/// Absolute addresses that point at `localhost` are redirected to the API host, because on the emulator
/// `localhost` is the phone itself, not your computer.
String assetUrl(String? path, {String? apiBaseUrl}) {
  if (path == null || path.isEmpty) return '';
  final base = Uri.parse(apiBaseUrl ?? AppConstants.apiBaseUrl);
  final origin = '${base.scheme}://${base.authority}';
  if (path.startsWith('/')) return '$origin$path';
  final uri = Uri.tryParse(path);
  if (uri == null || !uri.hasScheme) return path;
  if (uri.host == 'localhost' || uri.host == '127.0.0.1') {
    return uri.replace(scheme: base.scheme, host: base.host, port: base.hasPort ? base.port : null).toString();
  }
  return path;
}

const LabelPairs availabilities = [
  ('available', 'Available'),
  ('limited', 'Limited availability'),
  ('unavailable', 'Not taking jobs'),
];

const LabelPairs technicianSorts = [
  ('rating', 'Best rated'),
  ('experience', 'Most jobs done'),
  ('newest', 'Newest'),
];

/// The repair workflow's steps in plain words (mirrors `SERVICE_REQUEST_STATUS` on the server).
const Map<String, String> requestStatusLabels = {
  'request_submitted': 'Waiting for a technician',
  'technician_assigned': 'Technician accepted',
  'device_collection_pending': 'Pickup arranged',
  'device_collected': 'Device collected',
  'diagnosis_in_progress': 'Being checked',
  'quotation_submitted': 'Quote sent',
  'customer_approval_pending': 'Your approval needed',
  'repair_in_progress': 'Repair in progress',
  'repair_completed': 'Repair done',
  'device_delivery_pending': 'On its way back',
  'device_delivered': 'Device returned',
  'service_completed': 'Completed',
  'rejected': 'Declined',
  'cancelled': 'Cancelled',
};

/// Requests that can no longer change.
const finalRequestStatuses = {'service_completed', 'rejected', 'cancelled'};

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// "16 Nov 2026, 3:05 PM" in the phone's time zone, or an empty string when there is no date.
String formatDateTime(DateTime? value) {
  if (value == null) return '';
  final d = value.toLocal();
  final hour12 = d.hour % 12 == 0 ? 12 : d.hour % 12;
  final minutes = d.minute.toString().padLeft(2, '0');
  return '${d.day} ${_months[d.month - 1]} ${d.year}, $hour12:$minutes ${d.hour < 12 ? 'AM' : 'PM'}';
}

/// "16 Nov 2026".
String formatDate(DateTime? value) {
  if (value == null) return '';
  final d = value.toLocal();
  return '${d.day} ${_months[d.month - 1]} ${d.year}';
}
