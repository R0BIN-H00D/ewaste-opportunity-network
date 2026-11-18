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

/// What a person can choose for a new listing; [services] keeps every label so older listings read correctly.
const listableServices = ['repair', 'refurbishment', 'recycling'];

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
    return uri
        .replace(
            scheme: base.scheme,
            host: base.host,
            port: base.hasPort ? base.port : null)
        .toString();
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

/// The same steps worded for the technician, where the owner's wording would be wrong ("Your approval needed").
const Map<String, String> technicianStatusLabels = {
  'request_submitted': 'New request',
  'technician_assigned': 'Accepted',
  'diagnosis_in_progress': 'Diagnosing',
  'customer_approval_pending': 'Waiting for approval',
  'device_delivery_pending': 'Returning the device',
};

/// A status in words for whoever is looking: the technician's wording where it differs, otherwise the owner's.
String requestStatusLabel(String status, {bool technician = false}) =>
    (technician ? technicianStatusLabels[status] : null) ??
    requestStatusLabels[status] ??
    status;

/// Requests that can no longer change.
const finalRequestStatuses = {'service_completed', 'rejected', 'cancelled'};

const _months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];

/// "16 Nov 2026, 3:05 PM" in the phone's time zone, or an empty string when there is no date.
String formatDateTime(DateTime? value) {
  if (value == null) return '';
  final d = value.toLocal();
  final hour12 = d.hour % 12 == 0 ? 12 : d.hour % 12;
  final minutes = d.minute.toString().padLeft(2, '0');
  return '${d.day} ${_months[d.month - 1]} ${d.year}, $hour12:$minutes ${d.hour < 12 ? 'AM' : 'PM'}';
}

/// When saved data was kept: "3:05 PM" for today, otherwise the date and time. [now] is for tests.
String formatSavedAt(DateTime saved, {DateTime? now}) {
  final s = saved.toLocal();
  final n = (now ?? DateTime.now()).toLocal();
  if (s.year == n.year && s.month == n.month && s.day == n.day) {
    final hour12 = s.hour % 12 == 0 ? 12 : s.hour % 12;
    return '$hour12:${s.minute.toString().padLeft(2, '0')} ${s.hour < 12 ? 'AM' : 'PM'}';
  }
  return formatDateTime(s);
}

/// A short time for a conversation: "3:05 PM" today, "Yesterday", "16 Nov" this year, otherwise "16 Nov 2025". [now] is for tests.
String formatChatTime(DateTime? value, {DateTime? now}) {
  if (value == null) return '';
  final d = value.toLocal();
  final n = (now ?? DateTime.now()).toLocal();
  final today = DateTime(n.year, n.month, n.day);
  final day = DateTime(d.year, d.month, d.day);
  final daysAgo = today.difference(day).inDays;
  if (daysAgo <= 0) {
    final hour12 = d.hour % 12 == 0 ? 12 : d.hour % 12;
    return '$hour12:${d.minute.toString().padLeft(2, '0')} ${d.hour < 12 ? 'AM' : 'PM'}';
  }
  if (daysAgo == 1) return 'Yesterday';
  return d.year == n.year ? '${d.day} ${_months[d.month - 1]}' : formatDate(d);
}

/// "Nov" for a `YYYY-MM` month key (a chart axis), or "Nov 2026" with [withYear]. Anything unreadable comes back as it was.
String formatMonthKey(String key, {bool withYear = false}) {
  final parts = key.split('-');
  final month = parts.length == 2 ? int.tryParse(parts[1]) : null;
  if (month == null || month < 1 || month > 12) return key;
  return withYear ? '${_months[month - 1]} ${parts[0]}' : _months[month - 1];
}

/// "1.5 kg", "0.8 kg" and "12 kg": at most one decimal, none when it is whole, so a weight never looks more exact than it is.
String formatWeight(num kg) {
  final rounded = (kg * 10).round() / 10;
  return '${rounded == rounded.roundToDouble() ? rounded.toStringAsFixed(0) : rounded.toStringAsFixed(1)} kg';
}

/// "16 Nov 2026".
String formatDate(DateTime? value) {
  if (value == null) return '';
  final d = value.toLocal();
  return '${d.day} ${_months[d.month - 1]} ${d.year}';
}

/// Kinds of verification document (mirrors `DOC_TYPES` on the server).
const Map<String, String> docTypeLabels = {
  'id_proof': 'ID proof',
  'qualification': 'Qualification certificate',
  'business': 'Business registration',
  'authorization': 'Authorisation or licence',
  'other': 'Other document',
};

/// Where a provider's approval stands (mirrors `VERIFICATION_STATUS`).
const Map<String, String> verificationLabels = {
  'not_submitted': 'Not submitted',
  'pending': 'Under review',
  'approved': 'Approved',
  'rejected': 'Not approved',
  'resubmission_required': 'More needed',
};

/// Where a recycling request stands, worded for the person who sent it (mirrors `RECYCLING_STATUS`).
const Map<String, String> recyclingStatusLabels = {
  'requested': 'Waiting for the centre',
  'accepted': 'Accepted',
  'pickup_scheduled': 'Pickup scheduled',
  'collected': 'Handed over',
  'received_at_center': 'Received at the centre',
  'processed': 'Processed',
  'completed': 'Completed',
  'rejected': 'Declined',
  'cancelled': 'Cancelled',
};

/// The same steps worded for the recycling centre, where the sender's wording would be wrong.
const Map<String, String> recyclingCenterStatusLabels = {
  'requested': 'New request',
  'collected': 'Collected',
  'received_at_center': 'Received',
};

/// A recycling status in words for whoever is looking.
String recyclingStatusLabel(String status, {bool center = false}) =>
    (center ? recyclingCenterStatusLabels[status] : null) ??
    recyclingStatusLabels[status] ??
    status;

/// Recycling requests that can no longer change.
const finalRecyclingStatuses = {'completed', 'rejected', 'cancelled'};

/// What a centre can recover (mirrors `MATERIAL_TYPES`).
const LabelPairs materialTypes = [
  ('copper', 'Copper'),
  ('aluminium', 'Aluminium'),
  ('iron', 'Iron'),
  ('plastics', 'Plastics'),
  ('glass', 'Glass'),
  ('other', 'Other'),
];

/// Kilograms the way people read them: "12 kg", "0.45 kg". No trailing zeros.
String formatKg(num value) {
  final text = value == value.roundToDouble()
      ? value.round().toString()
      : value.toStringAsFixed(3).replaceFirst(RegExp(r'0+$'), '');
  return '$text kg';
}

/// The disclosed grade of a refurbished product (mirrors `PRODUCT_CONDITIONS`, BR-11).
const LabelPairs productConditions = [
  ('like_new', 'Like new'),
  ('excellent', 'Excellent'),
  ('good', 'Good'),
  ('fair', 'Fair'),
];

const LabelPairs productSorts = [
  ('newest', 'Newest'),
  ('price_asc', 'Price: low to high'),
  ('price_desc', 'Price: high to low'),
  ('rating', 'Top rated'),
];

/// Payment is made to the seller directly; the app never handles money (BR-10).
const LabelPairs paymentMethods = [
  ('cod', 'Cash on delivery'),
  ('offline', 'Pay the seller directly'),
];

/// Where an order stands, worded for the buyer (mirrors `ORDER_STATUS`).
const Map<String, String> orderStatusLabels = {
  'placed': 'Waiting for the seller',
  'confirmed': 'Confirmed',
  'ready': 'Ready',
  'delivered': 'Handed over',
  'completed': 'Completed',
  'cancelled': 'Cancelled',
};

/// The same steps worded for the seller.
const Map<String, String> sellerOrderStatusLabels = {
  'placed': 'New order',
  'delivered': 'Waiting for the buyer to confirm',
};

String orderStatusLabel(String status, {bool seller = false}) =>
    (seller ? sellerOrderStatusLabels[status] : null) ??
    orderStatusLabels[status] ??
    status;

/// "Refurbished · Good": the label and the disclosed grade always travel together (BR-11).
String refurbishedLabel(String condition) =>
    'Refurbished · ${labelOf(productConditions, condition)}';

/// Where a donation stands (mirrors the donation workflow in the API).
const Map<String, String> donationStatusLabels = {
  'open': 'Open',
  'requested': 'Requests received',
  'accepted': 'Recipient chosen',
  'handover_scheduled': 'Handover arranged',
  'completed': 'Completed',
  'cancelled': 'Cancelled',
};

/// The same steps worded for someone who asked for the device.
const Map<String, String> recipientDonationStatusLabels = {
  'open': 'Open',
  'requested': 'Waiting for the donor',
  'accepted': 'You were chosen',
  'handover_scheduled': 'Handover arranged',
};

String donationStatusLabel(String status, {bool recipient = false}) =>
    (recipient ? recipientDonationStatusLabels[status] : null) ??
    donationStatusLabels[status] ??
    status;

const Map<String, String> donationRequestStatusLabels = {
  'pending': 'Waiting for a decision',
  'accepted': 'Chosen',
  'rejected': 'Not chosen',
  'withdrawn': 'Withdrawn',
};

const LabelPairs orgTypes = [
  ('school', 'School'),
  ('college', 'College'),
  ('ngo', 'NGO'),
  ('trust', 'Trust'),
  ('company', 'Company'),
  ('other', 'Other'),
];

/// Where a refurbishment job stands, worded for the refurbisher.
const Map<String, String> refurbStatusLabels = {
  'offered': 'Offer sent',
  'accepted': 'Offer accepted',
  'collected': 'Collected',
  'assessment': 'Being assessed',
  'in_progress': 'Being refurbished',
  'testing': 'Being tested',
  'ready_to_list': 'Ready to sell',
  'listed': 'On sale',
  'cancelled': 'Cancelled',
};

/// The same steps worded for the owner of the device.
const Map<String, String> ownerRefurbStatusLabels = {
  'offered': 'Offer received',
  'accepted': 'You accepted',
  'collected': 'With the refurbisher',
  'assessment': 'Being assessed',
  'in_progress': 'Being refurbished',
  'testing': 'Being tested',
  'ready_to_list': 'Almost ready to sell',
  'listed': 'On sale',
  'cancelled': 'Cancelled',
};

String refurbStatusLabel(String status, {bool owner = false}) =>
    (owner ? ownerRefurbStatusLabels[status] : null) ??
    refurbStatusLabels[status] ??
    status;

/// The label for the button that moves a job on, by the step it leads to.
const Map<String, String> refurbAdvanceLabels = {
  'assessment': 'Start the assessment',
  'in_progress': 'Start refurbishing',
  'testing': 'Move to testing',
  'ready_to_list': 'Mark ready to sell',
};

const LabelPairs productStatuses = [
  ('active', 'On sale'),
  ('hidden', 'Hidden'),
  ('sold', 'Sold out'),
];
