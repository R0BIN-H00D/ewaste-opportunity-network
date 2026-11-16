import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/user.dart';
import 'package:ewaste_opportunity/models/verification.dart';
import 'package:ewaste_opportunity/providers/auth_controller.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/providers/photo_providers.dart';
import 'package:ewaste_opportunity/providers/verification_providers.dart';
import 'package:ewaste_opportunity/screens/account/verification_screen.dart';
import 'package:ewaste_opportunity/services/photo_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import '../fakes.dart';
import '../helpers.dart';

const _photo = PickedPhoto(path: '/tmp/id.jpg', name: 'id.jpg', mime: 'image/jpeg', bytes: 1000);

Future<void> _pump(WidgetTester tester, FakeVerificationRepository repo, {FakePhotoPicker? picker}) async {
  tester.view.physicalSize = const Size(900, 2800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository(loginResult: sampleMe(role: UserRole.technician))),
        verificationRepositoryProvider.overrideWithValue(repo),
        photoPickerProvider.overrideWithValue(picker ?? FakePhotoPicker(gallery: const [_photo])),
      ],
      child: MaterialApp(theme: AppTheme.light(), home: const Scaffold(body: VerificationScreen())),
    ),
  );
  final container = ProviderScope.containerOf(tester.element(find.byType(MaterialApp)));
  await container.read(authControllerProvider.notifier).signIn(email: 'asha@example.com', password: 'x');
  await _settle(tester);
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 5; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await _settle(tester);
}

void main() {
  testWidgets('nothing sent yet: says so and offers the allowed kinds, with Send disabled', (tester) async {
    await _pump(tester, FakeVerificationRepository());
    expect(find.text('Not submitted'), findsOneWidget);
    expect(find.text('ID proof'), findsOneWidget);
    expect(find.text('Qualification certificate'), findsOneWidget);
    expect(find.text('Choose the kind of document first.'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.ancestor(of: find.text('Send for approval'), matching: find.byType(FilledButton))).onPressed, isNull);
  });

  testWidgets('choosing a kind and a photo sends it, then shows it as waiting', (tester) async {
    final repo = FakeVerificationRepository();
    await _pump(tester, repo);
    await _tap(tester, find.text('ID proof'));
    expect(find.text('Add at least one photo.'), findsOneWidget);
    await _tap(tester, find.text('Choose'));
    await _tap(tester, find.text('Send for approval'));

    expect(repo.calls, ['submit:id_proof:1']);
    expect(find.text('Under review'), findsOneWidget);
    expect(find.text('Waiting'), findsOneWidget);
    expect(find.text('id.jpg'), findsOneWidget);
  });

  testWidgets('a rejected provider sees the reason and can send again', (tester) async {
    final repo = FakeVerificationRepository(
      current: VerificationStatus.fromJson(verificationJson(status: 'rejected', reason: 'The photo is blurry', documents: [verificationDocJson(status: 'rejected', reason: 'Too dark')])),
    );
    await _pump(tester, repo);
    expect(find.text('Not approved'), findsOneWidget);
    expect(find.text('Reason: The photo is blurry'), findsOneWidget);
    expect(find.text('Too dark'), findsOneWidget);
    expect(find.text('Send more documents'), findsOneWidget);
  });

  testWidgets('a document that is not approved can be removed after confirming', (tester) async {
    final repo = FakeVerificationRepository(current: VerificationStatus.fromJson(verificationJson(status: 'pending', documents: [verificationDocJson()])));
    await _pump(tester, repo);
    await _tap(tester, find.byTooltip('Remove ID proof'));
    expect(find.text('Remove this document?'), findsOneWidget);
    await _tap(tester, find.text('Remove'));
    expect(repo.calls, ['remove:d1']);
    expect(find.text('Documents you sent'), findsNothing);
  });

  testWidgets('an approved provider has nothing to send and nothing to remove', (tester) async {
    final repo = FakeVerificationRepository(current: VerificationStatus.fromJson(verificationJson(status: 'approved', documents: [verificationDocJson(status: 'approved')])));
    await _pump(tester, repo);
    expect(find.text('Approved'), findsWidgets);
    expect(find.text('Send documents'), findsNothing);
    expect(find.text('Send more documents'), findsNothing);
    expect(find.byTooltip('Remove ID proof'), findsNothing);
  });
}
