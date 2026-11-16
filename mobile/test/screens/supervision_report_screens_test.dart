import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/listing.dart';
import 'package:ewaste_opportunity/models/recycling_report.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/providers/learning_providers.dart';
import 'package:ewaste_opportunity/providers/listings_controller.dart';
import 'package:ewaste_opportunity/providers/recycling_providers.dart';
import 'package:ewaste_opportunity/screens/learning/application_details_screen.dart';
import 'package:ewaste_opportunity/screens/learning/applicants_screen.dart';
import 'package:ewaste_opportunity/screens/learning/my_tasks_screen.dart';
import 'package:ewaste_opportunity/screens/learning/opportunity_details_screen.dart';
import 'package:ewaste_opportunity/screens/learning/opportunity_form_screen.dart';
import 'package:ewaste_opportunity/screens/recycling/recycling_report_screen.dart';
import 'package:ewaste_opportunity/widgets/app_chip.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../fakes.dart';
import '../helpers.dart';
import '../models/supervision_report_models_test.dart';

Future<void> _pump(WidgetTester tester, Widget screen, {FakeLearningRepository? learning, FakeRecyclingRepository? recycling}) async {
  tester.view.physicalSize = const Size(900, 3000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, __) => Scaffold(body: screen)),
      GoRoute(path: '/learning/new', builder: (_, __) => const Scaffold(body: Text('new task page'))),
      GoRoute(path: '/learning/:id/applicants', builder: (_, s) => Scaffold(body: Text('applicants of ${s.pathParameters['id']}'))),
      GoRoute(path: '/learning/:id/edit', builder: (_, s) => Scaffold(body: Text('edit task ${s.pathParameters['id']}'))),
      GoRoute(path: '/learning/:id', builder: (_, s) => Scaffold(body: Text('task page ${s.pathParameters['id']}'))),
      GoRoute(path: '/applications/:id', builder: (_, s) => Scaffold(body: Text('application page ${s.pathParameters['id']}'))),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
        learningRepositoryProvider.overrideWithValue(learning ?? FakeLearningRepository()),
        recyclingRepositoryProvider.overrideWithValue(recycling ?? FakeRecyclingRepository()),
        deviceRepositoryProvider.overrideWithValue(FakeDeviceRepository()),
        categoriesProvider.overrideWith((ref) async => const [Category(id: 'c1', name: 'Phones', slug: 'phones'), Category(id: 'c2', name: 'Laptops', slug: 'laptops')]),
      ],
      child: MaterialApp.router(theme: AppTheme.light(), routerConfig: router),
    ),
  );
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pump(const Duration(milliseconds: 50));
}

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Finder _inDialog(String text) => find.descendant(of: find.byType(AlertDialog), matching: find.text(text));

/// Fills every field of the task form except the supervision promise; the deadline is accepted as the picker offers it.
Future<void> _fill(WidgetTester tester) async {
  await tester.enterText(find.widgetWithText(TextFormField, 'Task title'), 'Replace a phone battery');
  await _tap(tester, find.widgetWithText(DropdownButtonFormField<String>, 'Type of device'));
  await _tap(tester, find.text('Phones').last);
  await tester.enterText(find.widgetWithText(TextFormField, 'Skills (optional, separated by commas)'), 'Soldering, testing');
  await tester.enterText(find.widgetWithText(TextFormField, 'Area or locality'), 'Indiranagar');
  await tester.enterText(find.widgetWithText(TextFormField, 'How many students'), '2');
  await _tap(tester, find.text('Choose the last day to apply'));
  await _tap(tester, find.text('OK'));
}

void main() {
  group('my tasks', () {
    testWidgets('lists the tasks with how many applicants wait', (tester) async {
      final repo = FakeLearningRepository()
        ..minePages = {
          1: [sampleTask(), sampleTask(id: 'o2', status: 'closed', counts: const {})],
        };
      await _pump(tester, const MyTasksScreen(), learning: repo);

      expect(find.text('Replace a phone battery'), findsNWidgets(2));
      expect(find.text('2 applicants waiting'), findsOneWidget);
      expect(find.text('No applicants waiting'), findsOneWidget);
      expect(find.text('Post a task'), findsOneWidget);
    });

    testWidgets('a status chip asks for that status, and the buttons open the right pages', (tester) async {
      final repo = FakeLearningRepository()..minePages = {1: [sampleTask()]};
      await _pump(tester, const MyTasksScreen(), learning: repo);

      await _tap(tester, find.widgetWithText(AppChip, 'Closed'));
      expect(repo.mineCalls.last, 'closed');
      await _tap(tester, find.widgetWithText(AppChip, 'All'));
      await _tap(tester, find.text('Applicants'));
      expect(find.text('applicants of o1'), findsOneWidget);
    });

    testWidgets('an empty list explains how to start', (tester) async {
      await _pump(tester, const MyTasksScreen());
      expect(find.text('You have not posted a task yet'), findsOneWidget);
    });
  });

  group('a task, for its supervisor', () {
    testWidgets('shows the counts and the tools instead of an apply button', (tester) async {
      await _pump(tester, const OpportunityDetailsScreen(id: 'o1'), learning: FakeLearningRepository(opportunity: sampleTask()));

      expect(find.text('Your task'), findsOneWidget);
      expect(find.text('See applicants (2 waiting)'), findsOneWidget);
      expect(find.text('Apply for this task'), findsNothing);
      await _tap(tester, find.text('Edit task'));
      expect(find.text('edit task o1'), findsOneWidget);
    });

    testWidgets('closing a task asks first', (tester) async {
      final repo = FakeLearningRepository(opportunity: sampleTask());
      await _pump(tester, const OpportunityDetailsScreen(id: 'o1'), learning: repo);

      await _tap(tester, find.text('Close to new applications'));
      await _tap(tester, _inDialog('Close'));
      expect(repo.calls, ['close:o1']);
    });

    testWidgets('a closed task can be opened again', (tester) async {
      final repo = FakeLearningRepository(opportunity: sampleTask(status: 'closed'));
      await _pump(tester, const OpportunityDetailsScreen(id: 'o1'), learning: repo);
      await _tap(tester, find.text('Open again'));
      await _tap(tester, _inDialog('Open'));
      expect(repo.calls, ['open:o1']);
    });
  });

  group('the task form', () {
    testWidgets('an empty form says what is missing and sends nothing', (tester) async {
      final repo = FakeLearningRepository();
      await _pump(tester, const OpportunityFormScreen(), learning: repo);

      await _tap(tester, find.text('Post task'));
      expect(find.text('Give the task a clear title'), findsOneWidget);
      expect(find.text('Choose the type of device'), findsOneWidget);
      expect(find.text('Enter the area or locality'), findsOneWidget);
      expect(find.text('Choose the last day students can apply'), findsOneWidget);
      expect(repo.calls, isEmpty);
    });

    testWidgets('posting needs the supervision promise', (tester) async {
      final repo = FakeLearningRepository();
      await _pump(tester, const OpportunityFormScreen(), learning: repo);
      await _fill(tester);
      await _tap(tester, find.text('Post task'));
      expect(find.text('Confirm that you will supervise and that no hazardous handling is involved'), findsOneWidget);
      expect(repo.calls, isEmpty);
    });

    testWidgets('a complete form posts the task and opens it', (tester) async {
      final repo = FakeLearningRepository();
      await _pump(tester, const OpportunityFormScreen(), learning: repo);
      await _fill(tester);
      await _tap(tester, find.byType(CheckboxListTile));
      await _tap(tester, find.text('Post task'));

      expect(repo.calls, ['post:Replace a phone battery']);
      final sent = repo.inputs.single;
      expect(sent.deviceTypeId, 'c1');
      expect(sent.requiredSkills, ['soldering', 'testing']);
      expect(sent.seats, 2);
      expect(sent.supervisionAcknowledged, isTrue);
      expect(find.text('task page o-new'), findsOneWidget);
    });

    testWidgets('editing starts from the task and does not ask for the promise again', (tester) async {
      final repo = FakeLearningRepository(opportunity: sampleTask());
      await _pump(tester, const OpportunityFormScreen(opportunityId: 'o1'), learning: repo);

      expect(find.text('Replace a phone battery'), findsOneWidget);
      expect(find.byType(CheckboxListTile), findsNothing);
      await tester.enterText(find.widgetWithText(TextFormField, 'How many students'), '4');
      await _tap(tester, find.text('Save changes'));
      expect(repo.calls, ['edit:o1']);
      expect(repo.inputs.single.seats, 4);
    });
  });

  group('applicants', () {
    testWidgets('lists the students with their college and status', (tester) async {
      final repo = FakeLearningRepository()..applicantList = [sampleApplicant()];
      await _pump(tester, const ApplicantsScreen(opportunityId: 'o1'), learning: repo);

      expect(find.text('Priya'), findsOneWidget);
      expect(find.text('NIT Trichy · ECE'), findsOneWidget);
      expect(find.text('Waiting for review'), findsWidgets);
      await _tap(tester, find.text('Priya'));
      expect(find.text('application page a1'), findsOneWidget);
    });

    testWidgets('a status chip asks for that status', (tester) async {
      final repo = FakeLearningRepository();
      await _pump(tester, const ApplicantsScreen(opportunityId: 'o1'), learning: repo);
      expect(find.text('No applicants here'), findsOneWidget);
      await _tap(tester, find.widgetWithText(AppChip, 'Accepted'));
      expect(repo.applicantCalls.last, 'accepted');
    });
  });

  group('an application, for the supervisor', () {
    testWidgets('shows the student and no contact details', (tester) async {
      await _pump(tester, const ApplicationDetailsScreen(id: 'a1'), learning: FakeLearningRepository(current: sampleApplicant()));

      expect(find.textContaining('Priya applied'), findsOneWidget);
      expect(find.text('NIT Trichy'), findsOneWidget);
      expect(find.text('ECE, year 3'), findsOneWidget);
      expect(find.textContaining('Contact details are never shared'), findsOneWidget);
      expect(find.text('Withdraw application'), findsNothing);
    });

    testWidgets('accepting sends the note', (tester) async {
      final repo = FakeLearningRepository(current: sampleApplicant())..result = sampleApplicant(status: 'accepted', actions: const ['start', 'reject']);
      await _pump(tester, const ApplicationDetailsScreen(id: 'a1'), learning: repo);

      await _tap(tester, find.text('Accept'));
      await tester.enterText(find.descendant(of: find.byType(AlertDialog), matching: find.byType(TextField)), 'Welcome');
      await _tap(tester, _inDialog('Accept'));
      expect(repo.calls, ['accept:Welcome']);
      expect(find.text('Start the task'), findsOneWidget);
    });

    testWidgets('declining and starting ask first', (tester) async {
      final repo = FakeLearningRepository(current: sampleApplicant(status: 'accepted', actions: const ['start', 'reject']));
      await _pump(tester, const ApplicationDetailsScreen(id: 'a1'), learning: repo);

      await _tap(tester, find.text('Start the task'));
      await _tap(tester, _inDialog('Start'));
      await _tap(tester, find.text('Decline'));
      await _tap(tester, _inDialog('Decline'));
      expect(repo.calls, ['start', 'reject:']);
    });

    testWidgets('finishing records the hours and feedback, and needs hours', (tester) async {
      final repo = FakeLearningRepository(current: sampleApplicant(status: 'in_progress', actions: const ['complete']));
      await _pump(tester, const ApplicationDetailsScreen(id: 'a1'), learning: repo);

      await _tap(tester, find.text('Finish and record hours'));
      await _tap(tester, find.text('Finish task'));
      expect(find.text('Enter the hours as a number'), findsOneWidget);
      await tester.enterText(find.widgetWithText(TextFormField, 'Hours worked'), '3.5');
      await tester.enterText(find.widgetWithText(TextFormField, 'Feedback for the student (optional)'), 'Careful work');
      await _tap(tester, find.text('Finish task'));
      expect(repo.calls, ['complete:3.5:Careful work']);
    });

    testWidgets('shows the server\'s reason when a step is refused', (tester) async {
      final repo = FakeLearningRepository(current: sampleApplicant())..actionError = const ApiException('All places on this opportunity are taken', code: 'SEATS_FULL', failure: ApiFailure.conflict);
      await _pump(tester, const ApplicationDetailsScreen(id: 'a1'), learning: repo);
      await _tap(tester, find.text('Accept'));
      await _tap(tester, _inDialog('Accept'));
      expect(find.text('All places on this opportunity are taken'), findsOneWidget);
    });
  });

  group('the recycling report', () {
    testWidgets('shows requests, completions and the materials with measured and estimated apart', (tester) async {
      final repo = FakeRecyclingRepository()..reportData = RecyclingReport.fromJson(reportJson());
      await _pump(tester, const RecyclingReportScreen(), recycling: repo);

      expect(find.text('GreenCycle Recyclers'), findsOneWidget);
      expect(find.text('Requests received'), findsOneWidget);
      expect(find.text('Devices recycled'), findsOneWidget);
      expect(find.text('Measured'), findsOneWidget);
      expect(find.text('Estimated'), findsOneWidget);
      expect(find.text('Copper'), findsOneWidget);
      expect(find.text('3.25 kg'), findsWidgets);
      expect(find.text('REC-2026-0001'), findsOneWidget);
    });

    testWidgets('a period chip asks for that period', (tester) async {
      final repo = FakeRecyclingRepository()..reportData = RecyclingReport.fromJson(reportJson());
      await _pump(tester, const RecyclingReportScreen(), recycling: repo);
      expect(repo.reportCalls.first.from, isNull);

      await _tap(tester, find.widgetWithText(AppChip, 'Last 30 days'));
      expect(repo.reportCalls.last.from, isNotNull);
      expect(repo.reportCalls.last.to, isNotNull);
    });

    testWidgets('an empty period says nothing was recorded', (tester) async {
      final repo = FakeRecyclingRepository()..reportData = RecyclingReport.fromJson(reportJson(empty: true));
      await _pump(tester, const RecyclingReportScreen(), recycling: repo);
      expect(find.text('No materials were recorded in this period.'), findsOneWidget);
    });
  });
}
