import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/listing.dart';
import 'package:ewaste_opportunity/models/recycling_report.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/providers/chat_providers.dart';
import 'package:ewaste_opportunity/providers/impact_providers.dart';
import 'package:ewaste_opportunity/screens/impact/impact_screen.dart';
import 'package:ewaste_opportunity/providers/learning_providers.dart';
import 'package:ewaste_opportunity/screens/chat/chat_screen.dart';
import 'package:ewaste_opportunity/screens/chat/conversations_screen.dart';
import 'package:ewaste_opportunity/providers/listings_controller.dart';
import 'package:ewaste_opportunity/providers/marketplace_providers.dart';
import 'package:ewaste_opportunity/providers/photo_providers.dart';
import 'package:ewaste_opportunity/providers/recycling_providers.dart';
import 'package:ewaste_opportunity/providers/refurbishment_providers.dart';
import 'package:ewaste_opportunity/screens/auth/login_screen.dart';
import 'package:ewaste_opportunity/screens/auth/register_screen.dart';
import 'package:ewaste_opportunity/screens/learning/applicants_screen.dart';
import 'package:ewaste_opportunity/screens/learning/application_details_screen.dart';
import 'package:ewaste_opportunity/screens/learning/my_tasks_screen.dart';
import 'package:ewaste_opportunity/screens/learning/opportunity_details_screen.dart';
import 'package:ewaste_opportunity/screens/learning/opportunity_form_screen.dart';
import 'package:ewaste_opportunity/screens/recycling/recycling_report_screen.dart';
import 'package:ewaste_opportunity/screens/refurbishment/my_products_screen.dart';
import 'package:ewaste_opportunity/screens/refurbishment/product_form_screen.dart';
import 'package:ewaste_opportunity/screens/refurbishment/refurb_job_details_screen.dart';
import 'package:ewaste_opportunity/screens/refurbishment/refurb_jobs_screen.dart';
import 'package:ewaste_opportunity/screens/refurbishment/refurb_opportunities_screen.dart';
import 'package:ewaste_opportunity/services/location_service.dart';
import 'package:ewaste_opportunity/widgets/location_field.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../fakes.dart';
import '../helpers.dart';
import '../models/supervision_report_models_test.dart';

/// People with a large system font (Settings > Display > Font size) must still be able to read and use every screen.
/// Each screen is shown on a small phone (360 x 740) at 1.5x and 2x text; any overflow raises an error that fails the test.
const _scales = [1.5, 2.0];

Future<void> _show(WidgetTester tester, Widget screen, double scale) async {
  tester.view.physicalSize = const Size(360, 740);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final router = GoRouter(routes: [GoRoute(path: '/', builder: (_, __) => Scaffold(body: screen))]);
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
        refurbishmentRepositoryProvider.overrideWithValue(FakeRefurbishmentRepository(
          opportunityPages: {1: [sampleRefurbOpportunity(), sampleRefurbOpportunity(id: 'o2', hasOffered: true)]},
          pages: {1: [sampleRefurbJob(), sampleRefurbJob(id: 'j2', status: 'in_progress', actions: const [], amount: 0)]},
        )),
        marketplaceRepositoryProvider.overrideWithValue(FakeMarketplaceRepository()..minePages = {1: [sampleProduct(), sampleProduct(id: 'p2', status: 'hidden')]}),
        learningRepositoryProvider.overrideWithValue(FakeLearningRepository(opportunity: sampleTask(), current: sampleApplicant())
          ..minePages = {1: [sampleTask(), sampleTask(id: 'o2', status: 'closed', counts: const {})]}
          ..applicantList = [sampleApplicant()]),
        recyclingRepositoryProvider.overrideWithValue(FakeRecyclingRepository()..reportData = RecyclingReport.fromJson(reportJson())),
        chatRepositoryProvider.overrideWithValue(FakeChatRepository()
          ..conversationList = [sampleConversation(other: 'Someone with a long name', lastText: 'A fairly long message that has to wrap onto more than one line', unread: 12)]
          ..thread['c1'] = [sampleMessage('m1', 'A fairly long message that has to wrap onto more than one line ' * 3, sender: 'u1', read: true), sampleMessage('m2', 'Reply ' * 30, read: true)]),
        realtimeServiceProvider.overrideWithValue(FakeRealtime()),
        impactRepositoryProvider.overrideWithValue(FakeImpactRepository()),
        deviceRepositoryProvider.overrideWithValue(FakeDeviceRepository()),
        photoPickerProvider.overrideWithValue(FakePhotoPicker()),
        categoriesProvider.overrideWith((ref) async => const [Category(id: 'c1', name: 'Phones', slug: 'phones'), Category(id: 'c2', name: 'Laptops', slug: 'laptops')]),
      ],
      child: MaterialApp.router(
        theme: AppTheme.light(),
        routerConfig: router,
        builder: (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)), child: child!),
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  final screens = <String, Widget Function()>{
    'sign in': () => const LoginScreen(),
    'register': () => const RegisterScreen(),
    'devices to refurbish': () => const RefurbOpportunitiesScreen(),
    'refurbishment jobs': () => const RefurbJobsScreen(),
    'a refurbishment job': () => const RefurbJobDetailsScreen(id: 'j1'),
    'my products': () => const MyProductsScreen(),
    'the product form': () => const ProductFormScreen(),
    'my tasks': () => const MyTasksScreen(),
    'a task, for its supervisor': () => const OpportunityDetailsScreen(id: 'o1'),
    'the task form': () => const OpportunityFormScreen(),
    'the applicants': () => const ApplicantsScreen(opportunityId: 'o1'),
    'one application, for its supervisor': () => const ApplicationDetailsScreen(id: 'a1'),
    'the recycler report': () => const RecyclingReportScreen(),
    'the Green Score page': () => const ImpactScreen(),
    'the conversations': () => const ConversationsScreen(),
    'a conversation': () => const ChatScreen(conversationId: 'c1', title: 'A person with a rather long name', subtitle: 'Question about a device'),
    'the location field': () => SingleChildScrollView(child: LocationField(value: const GeoPoint(12.9716, 77.5946), onChanged: (_) {})),
  };

  for (final scale in _scales) {
    group('at $scale x text', () {
      screens.forEach((name, build) {
        testWidgets('$name fits without overflow', (tester) async {
          await _show(tester, build(), scale);
          expect(tester.takeException(), isNull);
        });
      });
    });
  }
}
