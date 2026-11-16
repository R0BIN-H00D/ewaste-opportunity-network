import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/donation.dart';
import 'package:ewaste_opportunity/models/listing.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/providers/donation_providers.dart';
import 'package:ewaste_opportunity/providers/listings_controller.dart';
import 'package:ewaste_opportunity/screens/donations/donation_details_screen.dart';
import 'package:ewaste_opportunity/screens/donations/donations_screen.dart';
import 'package:ewaste_opportunity/screens/donations/offer_donation_screen.dart';
import 'package:ewaste_opportunity/screens/donations/recipient_screen.dart';
import 'package:ewaste_opportunity/widgets/app_chip.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../fakes.dart';
import '../helpers.dart';
import '../models/donation_models_test.dart';
import '../models/listing_test.dart';

Future<void> _pump(WidgetTester tester, Widget screen, FakeDonationRepository repo, {List<Override> extra = const []}) async {
  tester.view.physicalSize = const Size(900, 3000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, __) => Scaffold(body: screen)),
      GoRoute(path: '/donations/:id', builder: (_, s) => Scaffold(body: Text('donation page ${s.pathParameters['id']}'))),
      GoRoute(path: '/account/recipient', builder: (_, __) => const Scaffold(body: Text('recipient page'))),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
        donationRepositoryProvider.overrideWithValue(repo),
        deviceRepositoryProvider.overrideWithValue(FakeDeviceRepository()),
        categoriesProvider.overrideWith((ref) async => const [Category(id: 'c2', name: 'Laptops', slug: 'laptops')]),
        ...extra,
      ],
      child: MaterialApp.router(theme: AppTheme.light(), routerConfig: router),
    ),
  );
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pump(const Duration(milliseconds: 50));
}

/// Taps and lets a dialog, sheet or answer finish (the pulsing skeletons keep `pumpAndSettle` from ever returning).
Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Finder _inDialog(String text) => find.descendant(of: find.byType(AlertDialog), matching: find.text(text));

Donation _d({String id = 'd1', String status = 'open', String role = 'visitor', int? pending, List<Map<String, dynamic>> requests = const []}) =>
    sampleDonation(id: id, status: status, role: role, pendingRequests: pending, requests: requests);

void main() {
  group('the donation list', () {
    testWidgets('shows each device with its condition, public place and status', (tester) async {
      final repo = FakeDonationRepository(pages: {1: [_d(), _d(id: 'd2', status: 'requested')]});
      await _pump(tester, const DonationsScreen(), repo);

      expect(find.text('Old Dell laptop'), findsNWidgets(2));
      expect(find.text('Laptops · Dell · Latitude'), findsNWidgets(2));
      expect(find.text('Indiranagar, Bengaluru'), findsNWidgets(2));
      expect(find.text('Open'), findsOneWidget);
      expect(find.text('Requests received'), findsOneWidget);
    });

    testWidgets('the donor sees how many requests are waiting', (tester) async {
      final repo = FakeDonationRepository(pages: {1: [_d(status: 'requested', role: 'donor', pending: 2)]});
      await _pump(tester, const DonationsScreen(), repo);
      expect(find.text('2 requests waiting'), findsOneWidget);
    });

    testWidgets('a condition chip filters, and the scopes switch between the lists', (tester) async {
      final repo = FakeDonationRepository(pages: {1: [_d()]});
      await _pump(tester, const DonationsScreen(), repo);

      await _tap(tester, find.widgetWithText(AppChip, 'Fully working'));
      expect(repo.queries.last.condition, 'fully_working');
      await _tap(tester, find.widgetWithText(AppChip, 'My donations'));
      expect(repo.queries.last.scope, 'donor');
      expect(repo.queries.last.condition, 'fully_working'); // the filter stays
    });

    testWidgets('each list says what is missing', (tester) async {
      await _pump(tester, const DonationsScreen(), FakeDonationRepository());
      expect(find.text('No donations right now'), findsOneWidget);
      await _tap(tester, find.widgetWithText(AppChip, 'My donations'));
      expect(find.text('You have not offered a device yet'), findsOneWidget);
      await _tap(tester, find.widgetWithText(AppChip, 'I asked for'));
      expect(find.text('You have not asked for a device yet'), findsOneWidget);
    });

    testWidgets('tapping a donation opens it; the organisation link opens the registration', (tester) async {
      final repo = FakeDonationRepository(pages: {1: [_d()]});
      await _pump(tester, const DonationsScreen(), repo);
      await _tap(tester, find.text('Old Dell laptop'));
      expect(find.text('donation page d1'), findsOneWidget);
    });

    testWidgets('the organisation link opens the registration', (tester) async {
      await _pump(tester, const DonationsScreen(), FakeDonationRepository());
      await _tap(tester, find.text('Register your organisation to ask for devices'));
      expect(find.text('recipient page'), findsOneWidget);
    });
  });

  group('a donation, asking for it', () {
    testWidgets('a verified organisation asks with a reason; a short one is refused', (tester) async {
      final repo = FakeDonationRepository(current: sampleDonation(actions: ['request']))
        ..result = sampleDonation(role: 'requester', myRequest: {'_id': 'r1', 'status': 'pending', 'justification': 'We run a computer lab for students'}, actions: ['withdraw']);
      await _pump(tester, const DonationDetailsScreen(id: 'd1'), repo);

      expect(find.text('Old Dell laptop'), findsOneWidget);
      expect(find.text('Indiranagar, Bengaluru'), findsOneWidget);
      await _tap(tester, find.text('Ask for this device'));
      await _tap(tester, find.text('Send request'));
      expect(find.text('Tell the donor why you need this device (at least a sentence)'), findsOneWidget);
      expect(repo.calls, isEmpty);

      await tester.enterText(find.widgetWithText(TextFormField, 'Why do you need it?'), 'We run a computer lab for students');
      await tester.enterText(find.widgetWithText(TextFormField, 'What will it be used for? (optional)'), 'Teaching typing');
      await _tap(tester, find.text('Send request'));

      expect(repo.calls, ['request:We run a computer lab for students:Teaching typing']);
      expect(find.text('Withdraw my request'), findsOneWidget);
      expect(find.text('Your request'), findsOneWidget);
      expect(find.text('Waiting for a decision'), findsOneWidget);
    });

    testWidgets('someone who is not verified is pointed to the registration', (tester) async {
      await _pump(tester, const DonationDetailsScreen(id: 'd1'), FakeDonationRepository());
      expect(find.text('Ask for this device'), findsNothing);
      expect(find.textContaining('Only verified organisations'), findsOneWidget);
      await _tap(tester, find.text('Register your organisation'));
      expect(find.text('recipient page'), findsOneWidget);
    });

    testWidgets('a request can be withdrawn after a check', (tester) async {
      final repo = FakeDonationRepository(current: sampleDonation(role: 'requester', myRequest: {'_id': 'r1', 'status': 'pending'}, actions: ['withdraw']))
        ..result = sampleDonation(role: 'requester', myRequest: {'_id': 'r1', 'status': 'withdrawn'}, actions: ['request']);
      await _pump(tester, const DonationDetailsScreen(id: 'd1'), repo);

      await _tap(tester, find.text('Withdraw my request'));
      expect(find.text('Withdraw your request?'), findsOneWidget);
      await _tap(tester, _inDialog('Withdraw'));
      expect(repo.calls, ['withdraw']);
      expect(find.text('Ask for this device'), findsOneWidget);
    });

    testWidgets('shows what the server refused', (tester) async {
      final repo = FakeDonationRepository(current: sampleDonation(actions: ['request']))..actionError = const ApiException('You have already asked for this donation', code: 'ALREADY_REQUESTED');
      await _pump(tester, const DonationDetailsScreen(id: 'd1'), repo);

      await _tap(tester, find.text('Ask for this device'));
      await tester.enterText(find.widgetWithText(TextFormField, 'Why do you need it?'), 'We run a computer lab for students');
      await _tap(tester, find.text('Send request'));
      expect(find.text('You have already asked for this donation'), findsOneWidget);
    });
  });

  group('a donation, for the donor', () {
    final rows = [requestRowJson(), requestRowJson(id: 'r2', name: 'Kiran', org: null)];

    testWidgets('lists who asked and why; choosing one asks first and declines the rest', (tester) async {
      final repo = FakeDonationRepository(current: sampleDonation(role: 'donor', status: 'requested', pendingRequests: 2, requests: rows, actions: ['decide', 'cancel']))
        ..result = sampleDonation(role: 'donor', status: 'accepted', withRecipient: true, actions: ['schedule_handover', 'cancel']);
      await _pump(tester, const DonationDetailsScreen(id: 'd1'), repo);

      expect(find.text('Requests'), findsOneWidget);
      expect(find.text('Sunrise School'), findsOneWidget);
      expect(find.text('Kiran'), findsOneWidget);
      expect(find.text('We are setting up a computer lab for 30 students'), findsNWidgets(2));

      await _tap(tester, find.text('Choose this one').first);
      expect(find.text('Choose Sunrise School?'), findsOneWidget);
      await _tap(tester, _inDialog('Choose'));

      expect(repo.calls, ['decide:r1:true']);
      expect(find.text('Arrange the handover'), findsOneWidget);
      expect(find.text('Choose this one'), findsNothing);
    });

    testWidgets('declining one request asks first', (tester) async {
      final repo = FakeDonationRepository(current: sampleDonation(role: 'donor', status: 'requested', pendingRequests: 2, requests: rows, actions: ['decide', 'cancel']));
      await _pump(tester, const DonationDetailsScreen(id: 'd1'), repo);

      await _tap(tester, find.text('Decline').first);
      expect(find.text('Decline Sunrise School?'), findsOneWidget);
      await _tap(tester, _inDialog('Decline'));
      expect(repo.calls, ['decide:r1:false']);
    });

    testWidgets('cancelling asks for an optional reason and shows the result', (tester) async {
      final repo = FakeDonationRepository(current: sampleDonation(role: 'donor', actions: ['cancel']))..result = sampleDonation(role: 'donor', status: 'cancelled', cancelReason: 'Changed my mind');
      await _pump(tester, const DonationDetailsScreen(id: 'd1'), repo);

      await _tap(tester, find.text('Cancel donation'));
      await tester.enterText(find.descendant(of: find.byType(AlertDialog), matching: find.byType(TextField)), 'Changed my mind');
      await _tap(tester, _inDialog('Cancel donation'));

      expect(repo.calls, ['cancel:Changed my mind']);
      expect(find.text('Reason: Changed my mind'), findsOneWidget);
      expect(find.text('Cancel donation'), findsNothing);
    });

    testWidgets('shows the handover and both sides\' confirmations', (tester) async {
      final repo = FakeDonationRepository(
        current: sampleDonation(
          role: 'donor',
          status: 'handover_scheduled',
          withRecipient: true,
          pickup: {'date': '2026-11-20T10:00:00.000Z', 'timeSlot': 'Morning', 'status': 'confirmed'},
          donorConfirmed: true,
        ),
      );
      await _pump(tester, const DonationDetailsScreen(id: 'd1'), repo);

      expect(find.text('Handover'), findsOneWidget);
      expect(find.text('Morning'), findsOneWidget);
      expect(find.text('You confirmed the handover'), findsOneWidget);
      expect(find.text('The recipient confirmed (not yet)'), findsOneWidget);
      expect(find.textContaining('Waiting for Sunrise School to confirm too'), findsOneWidget);
    });

    testWidgets('handing over needs the data-protection checklist ticked first', (tester) async {
      final repo = FakeDonationRepository(current: sampleDonation(role: 'donor', status: 'handover_scheduled', withRecipient: true, actions: ['confirm_handover', 'cancel']));
      await _pump(tester, const DonationDetailsScreen(id: 'd1'), repo);

      await _tap(tester, find.text('Confirm the handover'));
      expect(find.text('Before you hand it over'), findsOneWidget);
      expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Confirm handover')).onPressed, isNull);
      await _tap(tester, find.text('I have done this'));
      await _tap(tester, find.widgetWithText(FilledButton, 'Confirm handover'));
      expect(repo.calls, ['confirm:checklist']);
    });

    testWidgets('a completed donation shows its confirmation, and that no payment was made', (tester) async {
      final repo = FakeDonationRepository(current: sampleDonation(role: 'donor', status: 'completed', withRecipient: true, refNo: 'DON-2026-0001', actions: ['view_confirmation']));
      await _pump(tester, const DonationDetailsScreen(id: 'd1'), repo);

      expect(find.text('Confirmation'), findsOneWidget);
      expect(find.text('DON-2026-0001'), findsOneWidget);
      expect(find.textContaining('from Ravi Kumar to Sunrise School'), findsOneWidget);
      expect(find.text('No payment was made or processed.'), findsOneWidget);
    });

    testWidgets('if the other side changed it first, says so', (tester) async {
      final repo = FakeDonationRepository(current: sampleDonation(role: 'donor', actions: ['cancel']))
        ..actionError = const ApiException('This donation was just changed. Reload the page and try again.', code: 'STALE_STATE', failure: ApiFailure.conflict);
      await _pump(tester, const DonationDetailsScreen(id: 'd1'), repo);

      await _tap(tester, find.text('Cancel donation'));
      await _tap(tester, _inDialog('Cancel donation'));
      expect(find.text('This donation was just changed. Reload the page and try again.'), findsOneWidget);
    });
  });

  group('a donation, for the recipient', () {
    testWidgets('collecting the device is confirmed without the donor\'s checklist', (tester) async {
      final repo = FakeDonationRepository(current: sampleDonation(role: 'recipient', status: 'handover_scheduled', withRecipient: true, actions: ['confirm_handover']));
      await _pump(tester, const DonationDetailsScreen(id: 'd1'), repo);

      await _tap(tester, find.text('Confirm the handover'));
      expect(find.text('Did you collect it?'), findsOneWidget);
      await _tap(tester, _inDialog('Yes, I have it'));
      expect(repo.calls, ['confirm:plain']);
    });

    testWidgets('being chosen is explained, and the handover can be arranged', (tester) async {
      await _pump(tester, const DonationDetailsScreen(id: 'd1'), FakeDonationRepository(current: sampleDonation(role: 'recipient', status: 'accepted', withRecipient: true, actions: ['schedule_handover'])));
      expect(find.textContaining('chose you'), findsOneWidget);
      expect(find.text('Arrange the handover'), findsOneWidget);
    });
  });

  group('offering a device', () {
    final donationListing = Listing.fromJson({...listingJson(isOwner: true), 'preferredService': 'donation', 'condition': 'fully_working'});

    testWidgets('sends the note and opens the donation', (tester) async {
      final repo = FakeDonationRepository();
      await _pump(tester, const OfferDonationScreen(listingId: 'l1'), repo, extra: [listingProvider.overrideWith((ref, id) async => donationListing)]);

      expect(find.text('Old Samsung phone'), findsOneWidget);
      await tester.enterText(find.widgetWithText(TextFormField, 'A note for recipients (optional)'), 'Charger included');
      await _tap(tester, find.text('Offer this device'));

      expect(repo.calls, ['offer:l1:Charger included']);
      expect(find.text('donation page d-new'), findsOneWidget);
    });

    testWidgets('a device that is not set to Donation cannot be offered', (tester) async {
      final repairListing = Listing.fromJson({...listingJson(isOwner: true), 'preferredService': 'repair'});
      await _pump(tester, const OfferDonationScreen(listingId: 'l1'), FakeDonationRepository(), extra: [listingProvider.overrideWith((ref, id) async => repairListing)]);
      expect(find.textContaining('Set the service for this device to Donation first'), findsOneWidget);
      expect(find.text('Offer this device'), findsNothing);
    });

    testWidgets('shows what the server refused', (tester) async {
      final repo = FakeDonationRepository()..actionError = const ApiException('This listing already has an active service', code: 'LISTING_UNAVAILABLE');
      await _pump(tester, const OfferDonationScreen(listingId: 'l1'), repo, extra: [listingProvider.overrideWith((ref, id) async => donationListing)]);
      await _tap(tester, find.text('Offer this device'));
      expect(find.text('This listing already has an active service'), findsOneWidget);
    });
  });

  group('registering an organisation', () {
    testWidgets('needs a name and a registration number, then goes for verification', (tester) async {
      final repo = FakeDonationRepository();
      await _pump(tester, const RecipientScreen(), repo);

      expect(find.text('Not registered'), findsOneWidget);
      await _tap(tester, find.text('Send for verification'));
      expect(find.text('Enter the organisation name'), findsOneWidget);
      expect(find.text('Enter the registration number'), findsOneWidget);
      expect(repo.calls, isEmpty);

      await _tap(tester, find.widgetWithText(AppChip, 'NGO'));
      await tester.enterText(find.widgetWithText(TextFormField, 'Organisation name'), 'Helping Hands');
      await tester.enterText(find.widgetWithText(TextFormField, 'Registration number'), 'REG-123');
      await _tap(tester, find.text('Send for verification'));

      expect(repo.calls, ['apply:ngo:Helping Hands:REG-123']);
      expect(find.text('Waiting for review'), findsOneWidget);
      expect(find.text('Send for verification'), findsNothing);
    });

    testWidgets('a verified organisation sees its status and no form buttons', (tester) async {
      final repo = FakeDonationRepository(recipient: const RecipientStatus(isOrg: true, orgType: 'school', orgName: 'Sunrise School', registrationNo: 'REG-1', status: 'approved'));
      await _pump(tester, const RecipientScreen(), repo);
      expect(find.text('Verified'), findsOneWidget);
      expect(find.textContaining('Your organisation is verified'), findsOneWidget);
      expect(find.text('Send for verification'), findsNothing);
    });

    testWidgets('a refusal comes with its reason and the form can be sent again', (tester) async {
      final repo = FakeDonationRepository(recipient: const RecipientStatus(isOrg: true, orgType: 'school', orgName: 'Sunrise School', registrationNo: 'REG-1', status: 'rejected', reason: 'The number did not match'));
      await _pump(tester, const RecipientScreen(), repo);
      expect(find.text('Reason: The number did not match'), findsOneWidget);
      expect(find.text('Send again'), findsOneWidget);
    });
  });
}
