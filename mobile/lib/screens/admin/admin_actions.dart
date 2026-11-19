import '../../services/admin_repository.dart';
import 'admin_catalog.dart';

class AdminAction {
  const AdminAction(
    this.label,
    this.path,
    this.body, {
    this.method = 'PUT',
    this.note = '',
    this.min = 0,
    this.max = 500,
    this.danger = false,
    this.explanation,
  });

  final String label;
  final String path;
  final AdminRecord body;
  final String method;
  final String note;
  final int min;
  final int max;
  final bool danger;
  final String? explanation;

  String get noteKey => path.startsWith('complaints/') ? 'note' : 'reason';
}

/// The server supplies the transitions available for each moderation record.
List<AdminAction> adminActions(AdminSection section, AdminRecord item) {
  final id = Uri.encodeComponent((item['userId'] ?? adminId(item)).toString());
  final endpoint = '${section.name}/$id';
  final allowed = (item['actions'] as List?)?.whereType<String>() ?? const <String>[];
  final result = <AdminAction>[];
  for (final action in allowed) {
    final spec = switch ((section, action)) {
      (AdminSection.users, 'suspend') => AdminAction('Suspend account', '$endpoint/status', {'status': 'suspended'},
          note: 'Reason',
          min: 5,
          danger: true,
          explanation:
              'This signs the person out and hides their listings and offers. The person will see the reason.'),
      (AdminSection.users, 'reactivate') => AdminAction('Reactivate account', '$endpoint/status', {'status': 'active'}),
      (AdminSection.verifications, 'approve') =>
        AdminAction('Approve submission', endpoint, {'type': item['type'], 'decision': 'approved'}),
      (AdminSection.verifications, 'reject') => AdminAction(
          'Refuse submission', endpoint, {'type': item['type'], 'decision': 'rejected'},
          note: 'Reason', min: 1, danger: true, explanation: 'The applicant will see this reason.'),
      (AdminSection.verifications, 'request_resubmission') => AdminAction(
          'Ask for new documents', endpoint, {'type': item['type'], 'decision': 'resubmission_required'},
          note: 'What should they send?', min: 1, explanation: 'The applicant will see this request.'),
      (AdminSection.listings, 'remove') => AdminAction('Remove listing', '$endpoint/moderation', {'action': 'remove'},
          note: 'Reason', min: 5, danger: true),
      (AdminSection.listings, 'restore') =>
        AdminAction('Restore listing', '$endpoint/moderation', {'action': 'restore'}, note: 'Reason (optional)'),
      (AdminSection.reviews, 'hide') =>
        AdminAction('Hide review', '$endpoint/status', {'status': 'hidden'}, note: 'Reason', min: 5),
      (AdminSection.reviews, 'remove') =>
        AdminAction('Remove review', '$endpoint/status', {'status': 'removed'}, note: 'Reason', min: 5, danger: true),
      (AdminSection.reviews, 'restore') =>
        AdminAction('Restore review', '$endpoint/status', {'status': 'visible'}, note: 'Reason (optional)'),
      (AdminSection.reports, 'take_down') => AdminAction('Take down reported item', endpoint, {'decision': 'take_down'},
          note: 'Reason', min: 5, danger: true),
      (AdminSection.reports, 'resolve') =>
        AdminAction('Mark as handled', endpoint, {'decision': 'resolve'}, note: 'Reason', min: 5),
      (AdminSection.reports, 'dismiss') =>
        AdminAction('Dismiss report', endpoint, {'decision': 'dismiss'}, note: 'Reason (optional)'),
      (AdminSection.complaints, 'assign') =>
        AdminAction('Assign to me', endpoint, {'action': 'assign'}, note: 'Internal note (optional)', max: 1000),
      (AdminSection.complaints, 'start_review') =>
        AdminAction('Start review', endpoint, {'action': 'start_review'}, note: 'Internal note (optional)', max: 1000),
      (AdminSection.complaints, 'resolve') => AdminAction('Resolve complaint', endpoint, {'action': 'resolve'},
          note: 'Outcome', min: 5, max: 1000, explanation: 'The person who filed the complaint will see the outcome.'),
      (AdminSection.complaints, 'reject') => AdminAction('Reject complaint', endpoint, {'action': 'reject'},
          note: 'Reason',
          min: 5,
          max: 1000,
          danger: true,
          explanation: 'The person who filed the complaint will see the reason.'),
      _ => null,
    };
    if (spec != null) result.add(spec);
  }
  if (section == AdminSection.categories) {
    final active = item['active'] == true;
    result.add(AdminAction(active ? 'Switch off' : 'Switch on', endpoint, {'active': !active}));
  }
  if (section == AdminSection.education) {
    final published = item['status'] == 'published';
    result.add(AdminAction(
        published ? 'Unpublish article' : 'Publish article', endpoint, {'status': published ? 'draft' : 'published'}));
  }
  if (section == AdminSection.announcements && item['state'] == 'current') {
    result.add(AdminAction('End announcement now', endpoint, {'endsAt': DateTime.now().toUtc().toIso8601String()}));
  }
  if (section.canCreate && (section != AdminSection.categories || item['canDelete'] == true)) {
    final label = switch (section) {
      AdminSection.categories => 'category',
      AdminSection.education => 'article',
      _ => 'announcement',
    };
    result.add(AdminAction('Delete $label', endpoint, {}, method: 'DELETE', danger: true));
  }
  return result;
}
