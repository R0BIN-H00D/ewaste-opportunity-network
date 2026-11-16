import 'package:ewaste_opportunity/features/home/role_actions.dart';
import 'package:ewaste_opportunity/models/user.dart';
import 'package:ewaste_opportunity/routes/route_paths.dart';
import 'package:flutter_test/flutter_test.dart';
import '../helpers.dart';

void main() {
  test('every role has quick actions with titles and subtitles', () {
    for (final role in UserRole.values) {
      final actions = actionsFor(role);
      expect(actions, isNotEmpty, reason: role.name);
      for (final a in actions) {
        expect(a.title, isNotEmpty);
        expect(a.subtitle, isNotEmpty);
      }
    }
  });

  test('the screens that exist are linked, the rest say "Soon"', () {
    final byTitle = {for (final a in actionsFor(UserRole.user)) a.title: a.route};
    expect(byTitle['List a device'], Routes.newListing);
    expect(byTitle['My listings'], Routes.myListings);
    expect(byTitle['Browse devices'], Routes.browse);
    expect(byTitle['Find a technician'], Routes.technicians);
    expect(byTitle['My requests'], Routes.requests);
    expect(byTitle['Recycle'], Routes.recycling);
    expect(byTitle['My recycling'], Routes.recyclingRequests);
    final tech = {for (final a in actionsFor(UserRole.technician)) a.title: a.route};
    expect(tech['Repair requests'], Routes.jobsBoard);
    expect(tech['My jobs'], Routes.jobsActive);
    expect(tech['Student tasks'], Routes.myTasks);
    final recycler = {for (final a in actionsFor(UserRole.recycler)) a.title: a.route};
    expect(recycler['Recycling requests'], Routes.recyclingRequests);
    expect(recycler['Pickups'], Routes.recyclingRequestsWith('pickup_scheduled'));
    expect(recycler['Activity report'], Routes.recyclingReport);
    expect(recycler['Materials'], Routes.recyclingRequestsWith('received_at_center'));
    // Roles whose screens are still to come keep saying "Soon".
    expect(byTitle['Refurbished shop'], Routes.shop);
    expect(byTitle['My orders'], Routes.orders);
    expect(byTitle['Donations'], Routes.donations);
    expect(byTitle['My donations'], Routes.myDonations);
    final refurbisher = {for (final a in actionsFor(UserRole.refurbisher)) a.title: a.route};
    expect(refurbisher['Orders'], Routes.orders);
    expect(refurbisher['Devices to refurbish'], Routes.refurbOpportunities);
    expect(refurbisher['Refurbishment jobs'], Routes.refurbJobs);
    expect(refurbisher['My products'], Routes.myProducts);
    final student = {for (final a in actionsFor(UserRole.student)) a.title: a.route};
    expect(student['Opportunities'], Routes.opportunities);
    expect(student['My applications'], Routes.applications);
    expect(student['Certificates'], Routes.experience);
  });

  test('administrators are pointed to the web dashboard', () {
    final actions = actionsFor(UserRole.admin);
    expect(actions, hasLength(1));
    expect(actions.single.subtitle, contains('web'));
  });

  group('verificationMessage', () {
    final tech = sampleMe(role: UserRole.technician).user;
    final member = sampleMe().user;

    test('members and administrators get none', () {
      expect(verificationMessage(member, null), isNull);
      expect(verificationMessage(sampleMe(role: UserRole.admin).user, null), isNull);
    });

    test('an approved provider gets none', () {
      expect(verificationMessage(tech, 'approved'), isNull);
    });

    test('other states say what to do next', () {
      expect(verificationMessage(tech, null), contains('Submit your documents'));
      expect(verificationMessage(tech, 'not_submitted'), contains('Submit your documents'));
      expect(verificationMessage(tech, 'pending'), contains('checked'));
      expect(verificationMessage(tech, 'rejected'), contains('not approved'));
      expect(verificationMessage(tech, 'resubmission_required'), contains('more'));
    });
  });
}
