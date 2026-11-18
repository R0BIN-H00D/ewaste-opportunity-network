import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/providers/auth_controller.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/screens/home/home_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import '../helpers.dart';

Future<FakeAuthRepository> _pump(WidgetTester tester, {bool verified = false, FakeAuthRepository? repo}) async {
  tester.view.physicalSize = const Size(900, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final auth = repo ?? FakeAuthRepository(loginResult: sampleMe(emailVerified: verified));
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
        authRepositoryProvider.overrideWithValue(auth),
      ],
      child: MaterialApp(theme: AppTheme.light(), home: const Scaffold(body: HomeScreen())),
    ),
  );
  final container = ProviderScope.containerOf(tester.element(find.byType(MaterialApp)));
  await container.read(authControllerProvider.notifier).signIn(email: 'asha@example.com', password: 'x');
  for (var i = 0; i < 4; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
  return auth;
}

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  for (var i = 0; i < 4; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  testWidgets('a verified person sees no code box', (tester) async {
    await _pump(tester, verified: true);
    expect(find.text('Verify your email address'), findsNothing);
  });

  testWidgets('asks for the 6-digit code, keeps only digits, and checks it has six', (tester) async {
    final auth = await _pump(tester);
    expect(find.text('Verify your email address'), findsOneWidget);
    expect(find.textContaining('asha@example.com'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Verification code'), '12ab');
    expect(tester.widget<TextField>(find.widgetWithText(TextField, 'Verification code')).controller!.text, '12');
    await _tap(tester, find.widgetWithText(FilledButton, 'Verify'));
    expect(find.text('Enter the 6-digit code from your email.'), findsOneWidget);
    expect(auth.codes, isEmpty);
  });

  testWidgets('sends the code, and reloads the account so the box goes away', (tester) async {
    final auth = await _pump(tester);
    auth.meResult = sampleMe();
    await tester.enterText(find.widgetWithText(TextField, 'Verification code'), '482913');
    await _tap(tester, find.widgetWithText(FilledButton, 'Verify'));
    expect(auth.codes, ['482913']);
    expect(find.text('Verify your email address'), findsNothing);
  });

  testWidgets('shows what the server says about a wrong code', (tester) async {
    final auth = await _pump(tester);
    auth.codeError = const ApiException('That code is not right. 4 tries left.', statusCode: 400);
    await tester.enterText(find.widgetWithText(TextField, 'Verification code'), '000000');
    await _tap(tester, find.widgetWithText(FilledButton, 'Verify'));
    expect(find.text('That code is not right. 4 tries left.'), findsOneWidget);
    expect(find.text('Verify your email address'), findsOneWidget);
  });

  testWidgets('a resend says when the server has no email service, instead of claiming it sent one', (tester) async {
    final auth = await _pump(tester);
    auth.delivery = 'console';
    await _tap(tester, find.text('Resend code'));
    expect(auth.resends, 1);
    expect(find.textContaining('no email service set up'), findsOneWidget);
  });
}
