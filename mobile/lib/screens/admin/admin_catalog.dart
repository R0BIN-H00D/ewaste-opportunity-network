import 'package:material_ui/material_ui.dart';
import '../../services/admin_repository.dart';

enum AdminSection {
  verifications('Verifications', 'Review provider and recipient applications', Icons.verified_user_outlined),
  users('Users', 'Find accounts and manage access', Icons.people_outline),
  monitors('Monitors', 'Track repairs, donations, recycling and payments', Icons.monitor_heart_outlined),
  listings('Listings', 'Review and moderate device listings', Icons.devices_other_outlined),
  reviews('Reviews', 'Moderate ratings and feedback', Icons.star_outline),
  reports('Reports', 'Investigate reports and take action', Icons.flag_outlined),
  categories('Categories', 'Manage device categories and their display order', Icons.category_outlined),
  complaints('Complaints', 'Assign, investigate and resolve complaints', Icons.assignment_outlined),
  announcements('Announcements', 'Schedule updates for the community', Icons.campaign_outlined),
  education('Learning centre', 'Write and publish educational articles', Icons.menu_book_outlined),
  audit('Audit log', 'Review administrator activity', Icons.history_rounded),
  analytics('Analytics', 'Review trends and download CSV reports', Icons.bar_chart_rounded);

  const AdminSection(this.title, this.description, this.icon);
  final String title;
  final String description;
  final IconData icon;

  bool get canCreate => this == categories || this == announcements || this == education;
  bool get hasServerDetail => const {verifications, users, reports, complaints, education}.contains(this);
}

const adminRoles = ['user', 'technician', 'refurbisher', 'recycler', 'admin'];
const accountStatuses = ['active', 'pending_verification', 'suspended', 'deleted'];
const deviceStatuses = ['draft', 'listed', 'in_service', 'completed', 'withdrawn', 'removed_by_admin'];
const reviewStatuses = ['visible', 'hidden', 'removed'];
const reportReasons = ['spam', 'inappropriate', 'fraud', 'unsafe', 'wrong_category', 'other'];
const reportTargets = ['listing', 'review', 'product', 'user'];
const educationTopics = [
  'ewaste-problem',
  'safe-disposal',
  'reuse',
  'repair-benefits',
  'recycling',
  'data-security',
  'sustainability'
];
const monitorKinds = ['repairs', 'donations', 'refurbishment', 'recycling', 'transactions'];
const exportKinds = ['users', 'listings', ...monitorKinds];

String adminLabel(Object? value) {
  final text = value?.toString() ?? '';
  const labels = {
    'user': 'Member',
    'admin': 'Administrator',
    'recycler': 'Recycling centre',
    'transactions': 'Payments',
    'recipient': 'Recipient organisation',
    'all': 'All',
    'removed_by_admin': 'Removed by admin',
    'in_review': 'Being reviewed',
    'resubmission_required': 'Needs new documents',
    'ewaste-problem': 'E-waste problem',
    'co2eEstimateKg': 'Estimated CO₂e (kg)',
    'weighedKg': 'Weighed material (kg)',
    'estimatedKg': 'Estimated material (kg)',
    'openReports': 'Open reports',
  };
  if (labels.containsKey(text)) return labels[text]!;
  if (text.isEmpty) return '';
  final words = text
      .replaceAllMapped(RegExp(r'[a-z][A-Z]'), (m) => '${m[0]![0]} ${m[0]![1].toLowerCase()}')
      .replaceAll(RegExp(r'[_.-]'), ' ');
  return '${words[0].toUpperCase()}${words.substring(1)}';
}

String adminId(AdminRecord item) => (item['_id'] ?? item['id'] ?? '').toString();

String adminTitle(AdminSection section, AdminRecord item) => switch (section) {
      AdminSection.verifications => (adminRecord(item['user'])['name'] ?? item['name'] ?? 'Verification').toString(),
      AdminSection.reviews => '${item['rating'] ?? '—'} out of 5',
      AdminSection.reports => adminLabel(item['reason']),
      AdminSection.audit => adminLabel(item['action']),
      _ => (item['title'] ?? item['name'] ?? item['subject'] ?? section.title).toString(),
    };

class AdminField {
  const AdminField(this.key, this.label,
      {this.choices = const [],
      this.multi = false,
      this.toggle = false,
      this.date = false,
      this.dateTime = false,
      this.lines = 1,
      this.min = 0,
      this.max,
      this.initial});
  final String key;
  final String label;
  final List<String> choices;
  final bool multi;
  final bool toggle;
  final bool date;
  final bool dateTime;
  final int lines;
  final int min;
  final int? max;
  final Object? initial;
}

const fromDay = AdminField('from', 'From', date: true);
const toDay = AdminField('to', 'To', date: true);

List<AdminField> adminFilters(AdminSection section,
        {List<String> monitorStatuses = const [], List<String> categories = const []}) =>
    switch (section) {
      AdminSection.users => const [
          AdminField('q', 'Name or email', max: 80),
          AdminField('role', 'Role', choices: adminRoles),
          AdminField('status', 'Account status', choices: accountStatuses)
        ],
      AdminSection.verifications => const [
          AdminField('type', 'Application type', choices: ['provider', 'recipient']),
          AdminField('status', 'Status', choices: ['pending', 'approved', 'rejected', 'resubmission_required', 'all']),
          AdminField('role', 'Provider role', choices: ['technician', 'refurbisher', 'recycler']),
        ],
      AdminSection.monitors => [
          if (monitorStatuses.isNotEmpty) AdminField('status', 'Status', choices: monitorStatuses),
          fromDay,
          toDay
        ],
      AdminSection.listings => [
          const AdminField('q', 'Title, brand or model', max: 80),
          const AdminField('status', 'Status', choices: deviceStatuses),
          if (categories.isNotEmpty) AdminField('category', 'Category', choices: categories),
          const AdminField('reported', 'Reports', choices: ['true']),
        ],
      AdminSection.reviews => const [
          AdminField('status', 'Status', choices: reviewStatuses),
          AdminField('rating', 'Rating', choices: ['1', '2', '3', '4', '5']),
          AdminField('reported', 'Reports', choices: ['true']),
        ],
      AdminSection.reports => const [
          AdminField('status', 'Status', choices: ['open', 'actioned', 'dismissed', 'all']),
          AdminField('targetType', 'Reported item', choices: reportTargets),
          AdminField('reason', 'Reason', choices: reportReasons),
        ],
      AdminSection.complaints => const [
          AdminField('status', 'Status',
              choices: ['active', 'closed', 'open', 'assigned', 'in_review', 'resolved', 'rejected', 'all']),
          AdminField('assigned', 'Assigned to', choices: ['me', 'unassigned']),
        ],
      AdminSection.announcements => const [
          AdminField('state', 'Schedule', choices: ['current', 'scheduled', 'ended'])
        ],
      AdminSection.education => const [
          AdminField('q', 'Search articles', max: 100),
          AdminField('status', 'Status', choices: ['draft', 'published']),
          AdminField('topic', 'Topic', choices: educationTopics),
        ],
      _ => const [],
    };

List<AdminField> adminEditor(AdminSection section) => switch (section) {
      AdminSection.categories => const [
          AdminField('name', 'Name', min: 2, max: 60),
          AdminField('icon', 'Lucide icon name', max: 40),
          AdminField('group', 'Group', max: 40),
          AdminField('hazardous', 'Hazardous material', toggle: true),
        ],
      AdminSection.education => const [
          AdminField('title', 'Title', min: 3, max: 160),
          AdminField('topic', 'Topic', choices: educationTopics, min: 1, initial: 'ewaste-problem'),
          AdminField('summary', 'Summary', max: 300, lines: 3),
          AdminField('body', 'Article body (Markdown)', min: 20, max: 20000, lines: 8),
          AdminField('featured', 'Featured article', toggle: true),
          AdminField('status', 'Publication status', choices: ['draft', 'published'], min: 1, initial: 'draft'),
        ],
      AdminSection.announcements => const [
          AdminField('title', 'Title', min: 3, max: 140),
          AdminField('body', 'Message', min: 5, max: 2000, lines: 5),
          AdminField('audience', 'Audience', choices: ['all', ...adminRoles], multi: true, min: 1, initial: ['all']),
          AdminField('startsAt', 'Starts at', dateTime: true),
          AdminField('endsAt', 'Ends at', dateTime: true),
        ],
      _ => const [],
    };

List<AdminField> exportFilters(String kind) => [
      if (kind == 'users') const AdminField('role', 'Role', choices: adminRoles),
      if (kind == 'users') const AdminField('status', 'Account status', choices: accountStatuses),
      if (kind == 'listings') const AdminField('status', 'Listing status', choices: deviceStatuses),
      fromDay,
      toDay,
    ];
