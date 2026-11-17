import 'dart:async';
import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/learning.dart';
import 'package:ewaste_opportunity/models/listing.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/providers/learning_providers.dart';
import 'package:ewaste_opportunity/providers/listings_controller.dart';
import 'package:ewaste_opportunity/screens/learning/application_details_screen.dart';
import 'package:ewaste_opportunity/screens/learning/applications_screen.dart';
import 'package:ewaste_opportunity/screens/learning/experience_screen.dart';
import 'package:ewaste_opportunity/screens/learning/opportunities_screen.dart';
import 'package:ewaste_opportunity/screens/learning/opportunity_details_screen.dart';
import 'package:ewaste_opportunity/widgets/app_chip.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../fakes.dart';
import '../helpers.dart';

Future<void> _pump(WidgetTester tester, Widget screen, FakeLearningRepository repo, {FakeCertificateSaver? saver}) async {
  tester.view.physicalSize = const Size(900, 3000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, __) => Scaffold(body: screen)),
      GoRoute(path: '/learning/:id', builder: (_, s) => Scaffold(body: Text('task page ${s.pathParameters['id']}'))),
      GoRoute(path: '/applications/:id', builder: (_, s) => Scaffold(body: Text('application page ${s.pathParameters['id']}'))),
      GoRoute(path: '/account/verification', builder: (_, __) => const Scaffold(body: Text('verification page'))),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
        learningRepositoryProvider.overrideWithValue(repo),
        certificateSaverProvider.overrideWithValue(saver ?? FakeCertificateSaver()),
        deviceRepositoryProvider.overrideWithValue(FakeDeviceRepository()),
        categoriesProvider.overrideWith((ref) async => const [Category(id: 'c1', name: 'Phones', slug: 'phones')]),
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

void main() {
  group('the task list', () {
    testWidgets('shows each task with its level, area, deadline and places left', (tester) async {
      final repo = FakeLearningRepository(opportunityPages: {1: [sampleOpportunity(), sampleOpportunity(id: 'o2', seatsLeft: 0)]});
      await _pump(tester, const OpportunitiesScreen(), repo);

      expect(find.text('Replace a phone battery'), findsNWidgets(2));
      expect(find.text('2 places left'), findsOneWidget);
      expect(find.text('Full'), findsOneWidget);
      expect(find.textContaining('Indiranagar'), findsNWidgets(2));
      expect(find.textContaining('Apply by'), findsNWidgets(2));
    });

    testWidgets('a level chip and a device chip filter, and tapping again clears the level', (tester) async {
      final repo = FakeLearningRepository(opportunityPages: {1: [sampleOpportunity()]});
      await _pump(tester, const OpportunitiesScreen(), repo);

      await _tap(tester, find.widgetWithText(AppChip, 'Advanced'));
      expect(repo.opportunityQueries.last.difficulty, 'advanced');
      await _tap(tester, find.widgetWithText(AppChip, 'Phones'));
      expect(repo.opportunityQueries.last.category, 'phones');
      expect(repo.opportunityQueries.last.difficulty, 'advanced');
      await _tap(tester, find.widgetWithText(AppChip, 'Advanced'));
      expect(repo.opportunityQueries.last.difficulty, '');
    });

    testWidgets('says so when nothing is open, and tapping a task opens it', (tester) async {
      await _pump(tester, const OpportunitiesScreen(), FakeLearningRepository());
      expect(find.text('No tasks open right now'), findsOneWidget);
    });

    testWidgets('tapping a task opens it', (tester) async {
      await _pump(tester, const OpportunitiesScreen(), FakeLearningRepository(opportunityPages: {1: [sampleOpportunity()]}));
      await _tap(tester, find.text('Replace a phone battery'));
      expect(find.text('task page o1'), findsOneWidget);
    });

    testWidgets('a task the student already applied to says so on its card', (tester) async {
      final o = sampleOpportunity(applyBlock: 'already_applied', myApplication: {'_id': 'a1', 'status': 'accepted'});
      await _pump(tester, const OpportunitiesScreen(), FakeLearningRepository(opportunityPages: {1: [o]}));
      expect(find.text('Accepted'), findsOneWidget);
    });
  });

  group('a task', () {
    testWidgets('shows what it is, who supervises it, and that it is safe', (tester) async {
      await _pump(tester, const OpportunityDetailsScreen(id: 'o1'), FakeLearningRepository());

      expect(find.text('Replace a phone battery'), findsOneWidget);
      expect(find.text('Learn to open and test a phone safely'), findsOneWidget);
      expect(find.text('Ravi Kumar, Bengaluru'), findsOneWidget);
      expect(find.text('4.8 (12 reviews)'), findsOneWidget);
      expect(find.text('1 of 3 taken'), findsOneWidget);
      expect(find.text('soldering, testing'), findsOneWidget);
      expect(find.textContaining('never involve hazardous handling'), findsOneWidget);
    });

    testWidgets('applying sends the note and opens the application', (tester) async {
      final repo = FakeLearningRepository();
      await _pump(tester, const OpportunityDetailsScreen(id: 'o1'), repo);

      await _tap(tester, find.text('Apply for this task'));
      await tester.enterText(find.widgetWithText(TextFormField, 'Why do you want to do this? (optional)'), 'I like fixing phones');
      await _tap(tester, find.text('Send application'));

      expect(repo.calls, ['apply:o1:I like fixing phones']);
      expect(find.text('application page a-new'), findsOneWidget);
    });

    testWidgets('a note is optional', (tester) async {
      final repo = FakeLearningRepository();
      await _pump(tester, const OpportunityDetailsScreen(id: 'o1'), repo);
      await _tap(tester, find.text('Apply for this task'));
      await _tap(tester, find.text('Send application'));
      expect(repo.calls, ['apply:o1:']);
    });

    testWidgets('an unverified student is told, and sent to verification', (tester) async {
      await _pump(tester, const OpportunityDetailsScreen(id: 'o1'), FakeLearningRepository(opportunity: sampleOpportunity(applyBlock: 'not_verified')));
      expect(find.text('Apply for this task'), findsNothing);
      expect(find.text('Your student account must be verified by an administrator first.'), findsOneWidget);
      await _tap(tester, find.text('Open verification'));
      expect(find.text('verification page'), findsOneWidget);
    });

    testWidgets('a full or closed task says why', (tester) async {
      await _pump(tester, const OpportunityDetailsScreen(id: 'o1'), FakeLearningRepository(opportunity: sampleOpportunity(applyBlock: 'filled', seatsLeft: 0)));
      expect(find.text('All places on this task are taken.'), findsOneWidget);
      expect(find.text('Apply for this task'), findsNothing);
    });

    testWidgets('an application already sent is shown, with a way to follow it', (tester) async {
      final o = sampleOpportunity(applyBlock: 'already_applied', myApplication: {'_id': 'a1', 'status': 'applied'});
      await _pump(tester, const OpportunityDetailsScreen(id: 'o1'), FakeLearningRepository(opportunity: o));
      expect(find.text('Your application: Waiting for review'), findsOneWidget);
      await _tap(tester, find.text('See my application'));
      expect(find.text('application page a1'), findsOneWidget);
    });

    testWidgets('only students can apply', (tester) async {
      await _pump(tester, const OpportunityDetailsScreen(id: 'o1'), FakeLearningRepository(opportunity: sampleOpportunity(viewerRole: null)));
      expect(find.textContaining('Only students can apply'), findsOneWidget);
      expect(find.text('Apply for this task'), findsNothing);
    });

    testWidgets('shows what the server refused', (tester) async {
      final repo = FakeLearningRepository()..actionError = const ApiException('All places on this opportunity are taken', code: 'FILLED');
      await _pump(tester, const OpportunityDetailsScreen(id: 'o1'), repo);
      await _tap(tester, find.text('Apply for this task'));
      await _tap(tester, find.text('Send application'));
      expect(find.text('All places on this opportunity are taken'), findsOneWidget);
    });
  });

  group('my applications', () {
    testWidgets('lists each application with its status and hours', (tester) async {
      final repo = FakeLearningRepository(pages: {
        1: [sampleApplication(), sampleApplication(id: 'a2', status: 'completed', actions: const [], hours: 3.5)],
      });
      await _pump(tester, const ApplicationsScreen(), repo);

      expect(find.text('Replace a phone battery'), findsNWidgets(2));
      expect(find.text('Waiting for review'), findsWidgets);
      expect(find.text('3.5 hours'), findsOneWidget);
    });

    testWidgets('a status chip asks for that status; an empty list says so', (tester) async {
      final repo = FakeLearningRepository();
      await _pump(tester, const ApplicationsScreen(), repo);
      expect(find.text('No applications yet'), findsOneWidget);

      await _tap(tester, find.widgetWithText(AppChip, 'Accepted'));
      expect(repo.listCalls.last.status, 'accepted');
      expect(find.text('Nothing here'), findsOneWidget);
    });

    testWidgets('tapping an application opens it', (tester) async {
      await _pump(tester, const ApplicationsScreen(), FakeLearningRepository(pages: {1: [sampleApplication(id: 'zz')]}));
      await _tap(tester, find.text('Replace a phone battery'));
      expect(find.text('application page zz'), findsOneWidget);
    });
  });

  group('an application', () {
    testWidgets('shows the task, the supervisor, the note and the history', (tester) async {
      await _pump(tester, const ApplicationDetailsScreen(id: 'a1'), FakeLearningRepository());

      expect(find.text('Replace a phone battery'), findsOneWidget);
      expect(find.textContaining('Ravi Kumar will review your application'), findsOneWidget);
      expect(find.text('I like fixing phones'), findsOneWidget);
      expect(find.text('History'), findsOneWidget);
    });

    testWidgets('withdrawing asks for an optional reason and shows the result', (tester) async {
      final repo = FakeLearningRepository()..result = sampleApplication(status: 'withdrawn', actions: const []);
      await _pump(tester, const ApplicationDetailsScreen(id: 'a1'), repo);

      await _tap(tester, find.text('Withdraw application'));
      await tester.enterText(find.descendant(of: find.byType(AlertDialog), matching: find.byType(TextField)), 'No time');
      await _tap(tester, _inDialog('Withdraw'));

      expect(repo.calls, ['withdraw:No time']);
      expect(find.text('Withdraw application'), findsNothing);
      expect(find.textContaining('You withdrew this application'), findsOneWidget);
    });

    testWidgets('a completed application shows hours, feedback and the certificate', (tester) async {
      final repo = FakeLearningRepository(current: sampleApplication(status: 'completed', actions: const [], hours: 3.5, feedback: 'Careful work', certificate: 'CERT-2026-AB12CD'));
      await _pump(tester, const ApplicationDetailsScreen(id: 'a1'), repo);

      expect(find.text('3.5 hours'), findsOneWidget);
      expect(find.text('From the supervisor: Careful work'), findsOneWidget);
      expect(find.text('CERT-2026-AB12CD'), findsOneWidget);
      expect(find.text('Withdraw application'), findsNothing);
    });

    testWidgets('if the supervisor changed it first, says so', (tester) async {
      final repo = FakeLearningRepository()..actionError = const ApiException('This application was just changed. Reload the page and try again.', code: 'STALE_STATE', failure: ApiFailure.conflict);
      await _pump(tester, const ApplicationDetailsScreen(id: 'a1'), repo);
      await _tap(tester, find.text('Withdraw application'));
      await _tap(tester, _inDialog('Withdraw'));
      expect(find.text('This application was just changed. Reload the page and try again.'), findsOneWidget);
    });
  });

  group('experience', () {
    testWidgets('shows the hours, the certificates and the completed tasks', (tester) async {
      final repo = FakeLearningRepository(
        experience: Experience(
          summary: const StudentSummary(completedCount: 2, totalHours: 7.5, skills: ['testing'], college: 'NIT', course: 'ECE'),
          items: [sampleApplication(status: 'completed', actions: const [], hours: 3.5)],
        ),
        certificateList: const [Certificate(id: 'c1', certNo: 'CERT-2026-AB12CD', taskTitle: 'Replace a phone battery', hours: 3.5)],
      );
      await _pump(tester, const ExperienceScreen(), repo);

      expect(find.text('7.5 hours'), findsOneWidget);
      expect(find.text('2 tasks completed'), findsOneWidget);
      expect(find.text('NIT · ECE'), findsOneWidget);
      expect(find.text('Skills: testing'), findsOneWidget);
      expect(find.text('CERT-2026-AB12CD'), findsOneWidget);
      expect(find.text('Replace a phone battery'), findsWidgets);
    });

    testWidgets('says what is missing when there is nothing yet', (tester) async {
      await _pump(tester, const ExperienceScreen(), FakeLearningRepository());
      expect(find.textContaining('No certificates yet'), findsOneWidget);
      expect(find.textContaining('Nothing completed yet'), findsOneWidget);
    });

    group('downloading a certificate', () {
      final cert = [const Certificate(id: 'c1', certNo: 'CERT-2026-AB12CD', taskTitle: 'Replace a phone battery', hours: 3.5)];

      testWidgets('fetches the PDF and hands it to the share sheet under the server\'s file name', (tester) async {
        final repo = FakeLearningRepository(certificateList: cert);
        final saver = FakeCertificateSaver();
        await _pump(tester, const ExperienceScreen(), repo, saver: saver);
        await tester.tap(find.text('Download PDF'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(repo.pdfAsked, ['c1']);
        expect(saver.shared, [('certificate-c1.pdf', 4)]);
        expect(find.text('Download PDF'), findsOneWidget);
      });

      testWidgets('shows it is working, and cannot be tapped twice', (tester) async {
        final repo = FakeLearningRepository(certificateList: cert);
        final saver = FakeCertificateSaver()..hold = Completer<void>();
        await _pump(tester, const ExperienceScreen(), repo, saver: saver);
        await tester.tap(find.text('Download PDF'));
        await tester.pump();
        expect(find.text('Preparing...'), findsOneWidget);
        await tester.tap(find.text('Preparing...'), warnIfMissed: false);
        await tester.pump();
        expect(repo.pdfAsked, hasLength(1));
        saver.hold!.complete();
        await tester.pump(const Duration(milliseconds: 100));
        expect(find.text('Download PDF'), findsOneWidget);
      });

      testWidgets('says what the server said when it cannot be fetched', (tester) async {
        final repo = FakeLearningRepository(certificateList: cert)..pdfError = const ApiException('Certificate not found', failure: ApiFailure.notFound, statusCode: 404);
        final saver = FakeCertificateSaver();
        await _pump(tester, const ExperienceScreen(), repo, saver: saver);
        await tester.tap(find.text('Download PDF'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(find.text('Certificate not found'), findsOneWidget);
        expect(saver.shared, isEmpty);
        expect(find.text('Download PDF'), findsOneWidget);
      });

      testWidgets('says so when the phone cannot open it', (tester) async {
        final repo = FakeLearningRepository(certificateList: cert);
        final saver = FakeCertificateSaver()..failWith = StateError('no share sheet');
        await _pump(tester, const ExperienceScreen(), repo, saver: saver);
        await tester.tap(find.text('Download PDF'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(find.text('Could not open the certificate on this phone.'), findsOneWidget);
      });

      testWidgets('each certificate has its own button', (tester) async {
        final repo = FakeLearningRepository(certificateList: [...cert, const Certificate(id: 'c2', certNo: 'CERT-2026-FF00AA')]);
        final saver = FakeCertificateSaver();
        await _pump(tester, const ExperienceScreen(), repo, saver: saver);
        expect(find.text('Download PDF'), findsNWidgets(2));
        await tester.tap(find.text('Download PDF').last);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(repo.pdfAsked, ['c2']);
      });
    });  });
}
