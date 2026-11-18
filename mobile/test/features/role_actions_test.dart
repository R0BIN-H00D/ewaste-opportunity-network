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

  test('each role sees the same things as in the web side panel, Profile first', () {
    List<String> titles(UserRole r) => [for (final a in actionsFor(r)) a.title];
    expect(titles(UserRole.user).take(7).toList(), [
      'Profile', 'My devices', 'My repairs', 'Marketplace', 'Orders', 'Wanted devices', 'My pickups'
    ]);
    expect(titles(UserRole.technician).take(4).toList(), ['Profile', 'Find repair requests', 'My repair jobs', 'Wanted devices']);
    expect(titles(UserRole.refurbisher).take(4).toList(), ['Profile', 'Requests', 'Refurbished products', 'Orders']);
    expect(titles(UserRole.recycler).take(3).toList(), ['Profile', 'Recycling requests', 'Recycling report']);
    // What was taken out of the web menus is not on the phone either.
    for (final r in [UserRole.user, UserRole.technician, UserRole.refurbisher, UserRole.recycler]) {
      for (final gone in ['Donations', 'My donations', 'Recycle', 'My recycling', 'My impact', 'Refurbishment jobs', 'Materials', 'Activity report']) {
        expect(titles(r), isNot(contains(gone)), reason: '${r.name} should not have $gone');
      }
    }
  });

  test('the screens that exist are linked', () {
    Map<String, String?> routes(UserRole r) => {for (final a in actionsFor(r)) a.title: a.route};
    final user = routes(UserRole.user);
    expect(user['Profile'], Routes.profile);
    expect(user['My devices'], Routes.myListings);
    expect(user['My repairs'], Routes.requests);
    expect(user['Marketplace'], Routes.shop);
    expect(user['Orders'], Routes.orders);
    expect(user['Wanted devices'], Routes.wanted);
    expect(user['Notifications'], Routes.notifications);
    final tech = routes(UserRole.technician);
    expect(tech['Find repair requests'], Routes.jobsBoard);
    expect(tech['My repair jobs'], Routes.jobsActive);
    expect(tech['Wanted devices'], Routes.wanted);
    final refurbisher = routes(UserRole.refurbisher);
    expect(refurbisher['Requests'], Routes.refurbOpportunities);
    expect(refurbisher['Refurbished products'], Routes.myProducts);
    expect(refurbisher['Orders'], Routes.orders);
    final recycler = routes(UserRole.recycler);
    expect(recycler['Recycling requests'], Routes.recyclingRequests);
    expect(recycler['Recycling report'], Routes.recyclingReport);
  });

  test('everyone who can chat has Pickups, Messages and Notifications, then the Learning centre, as the last tiles, and administrators do not', () {
    for (final role in UserRole.values.where((r) => r != UserRole.admin)) {
      final titles = [for (final a in actionsFor(role)) a.title];
      expect(titles.sublist(titles.length - 4), ['My pickups', 'Messages', 'Notifications', 'Learning centre'], reason: role.name);
      expect(titles.where((t) => t == 'Messages'), hasLength(1), reason: role.name);
    }
    expect(actionsFor(UserRole.admin).where((a) => a.title == 'Messages'), isEmpty);
    expect(actionsFor(UserRole.admin).where((a) => a.title == 'Profile'), isEmpty);
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
      expect(verificationMessage(sampleMe(role: UserRole.admin).user, null),
          isNull);
    });

    test('an approved provider gets none', () {
      expect(verificationMessage(tech, 'approved'), isNull);
    });

    test('other states say what to do next', () {
      expect(
          verificationMessage(tech, null), contains('Submit your documents'));
      expect(verificationMessage(tech, 'not_submitted'),
          contains('Submit your documents'));
      expect(verificationMessage(tech, 'pending'), contains('checked'));
      expect(verificationMessage(tech, 'rejected'), contains('not approved'));
      expect(
          verificationMessage(tech, 'resubmission_required'), contains('more'));
    });
  });
}
