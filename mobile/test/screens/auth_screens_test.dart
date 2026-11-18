import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/user.dart';
import 'package:ewaste_opportunity/providers/auth_controller.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/screens/auth/login_screen.dart';
import 'package:ewaste_opportunity/screens/auth/register_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import '../helpers.dart';

Future<ProviderContainer> _pump(
    WidgetTester tester, Widget screen, FakeAuthRepository repo) async {
  tester.view.physicalSize = const Size(900, 2600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
        authRepositoryProvider.overrideWithValue(repo),
      ],
      child: MaterialApp(theme: AppTheme.light(), home: screen),
    ),
  );
  return ProviderScope.containerOf(tester.element(find.byType(Scaffold).first));
}

Finder _field(String label) => find.widgetWithText(TextFormField, label);

void main() {
  group('LoginScreen', () {
    testWidgets('empty fields show messages and nothing is sent',
        (tester) async {
      final repo = FakeAuthRepository();
      await _pump(tester, const LoginScreen(), repo);

      await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
      await tester.pump();

      expect(find.text('Enter your email'), findsOneWidget);
      expect(find.text('Enter your password'), findsOneWidget);
      expect(repo.loginEmails, isEmpty);
    });

    testWidgets('a server error is shown as a message', (tester) async {
      final repo = FakeAuthRepository(
          loginError: const ApiException('Incorrect email or password',
              failure: ApiFailure.unauthorized));
      await _pump(tester, const LoginScreen(), repo);

      await tester.enterText(_field('Email'), 'asha@example.com');
      await tester.enterText(_field('Password'), 'wrong-pass1');
      await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
      await tester.pump();
      await tester.pump();

      expect(find.text('Incorrect email or password'), findsOneWidget);
      expect(repo.loginEmails, ['asha@example.com']);
    });

    testWidgets('editing a field clears the message', (tester) async {
      final repo = FakeAuthRepository(
          loginError: const ApiException('Incorrect email or password',
              failure: ApiFailure.unauthorized));
      await _pump(tester, const LoginScreen(), repo);
      await tester.enterText(_field('Email'), 'asha@example.com');
      await tester.enterText(_field('Password'), 'wrong-pass1');
      await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
      await tester.pump();
      await tester.pump();
      expect(find.text('Incorrect email or password'), findsOneWidget);

      await tester.enterText(_field('Password'), 'wrong-pass12');
      await tester.pump();

      expect(find.text('Incorrect email or password'), findsNothing);
    });

    testWidgets('a good sign-in signs the person in', (tester) async {
      final repo =
          FakeAuthRepository(loginResult: sampleMe(role: UserRole.refurbisher));
      final container = await _pump(tester, const LoginScreen(), repo);

      await tester.enterText(_field('Email'), '  asha@example.com ');
      await tester.enterText(_field('Password'), 'Demo@12345');
      await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
      await tester.pump();
      await tester.pump();

      expect(container.read(authControllerProvider).status,
          AuthStatus.authenticated);
      expect(container.read(authControllerProvider).user?.role,
          UserRole.refurbisher);
    });

    testWidgets('the password can be shown and hidden', (tester) async {
      await _pump(tester, const LoginScreen(), FakeAuthRepository());
      expect(find.byTooltip('Show password'), findsOneWidget);

      await tester.tap(find.byTooltip('Show password'));
      await tester.pump();

      expect(find.byTooltip('Hide password'), findsOneWidget);
    });
  });

  group('RegisterScreen', () {
    testWidgets('lists the five roles and no administrator', (tester) async {
      await _pump(tester, const RegisterScreen(), FakeAuthRepository());

      for (final role in registrationRoles) {
        expect(find.text(role.label), findsOneWidget, reason: role.name);
      }
      expect(find.text('Administrator'), findsNothing);
    });

    testWidgets(
        'the organisation name appears only for refurbishers and recyclers',
        (tester) async {
      await _pump(tester, const RegisterScreen(), FakeAuthRepository());
      expect(_field('Organisation name'), findsNothing);

      await tester.tap(find.text('Refurbisher'));
      await tester.pump();
      expect(_field('Organisation name'), findsOneWidget);

      await tester.tap(find.text('Technician'));
      await tester.pump();
      expect(_field('Organisation name'), findsNothing);
    });

    testWidgets('provider roles are told about approval', (tester) async {
      await _pump(tester, const RegisterScreen(), FakeAuthRepository());
      expect(find.textContaining('checked by an administrator'), findsNothing);

      await tester.tap(find.text('Technician'));
      await tester.pump();

      expect(
          find.textContaining('checked by an administrator'), findsOneWidget);
    });

    testWidgets('mismatched passwords are caught before sending',
        (tester) async {
      final repo = FakeAuthRepository();
      await _pump(tester, const RegisterScreen(), repo);

      await tester.enterText(_field('Full name'), 'Asha Rao');
      await tester.enterText(_field('Email'), 'asha@example.com');
      await tester.enterText(_field('Password'), 'Demo@12345');
      await tester.enterText(_field('Confirm password'), 'Demo@12346');
      await tester.tap(find.widgetWithText(FilledButton, 'Create account'));
      await tester.pump();

      expect(find.text('The passwords do not match'), findsOneWidget);
      expect(repo.lastRegistration, isNull);
    });

    testWidgets('a complete form registers with the chosen role',
        (tester) async {
      final repo = FakeAuthRepository();
      final container = await _pump(tester, const RegisterScreen(), repo);

      await tester.tap(find.text('Recycling centre'));
      await tester.pump();
      await tester.enterText(_field('Full name'), 'Ravi Kumar');
      await tester.enterText(_field('Email'), 'ravi@example.com');
      await tester.enterText(_field('Organisation name'), 'GreenCycle');
      await tester.enterText(_field('Password'), 'Demo@12345');
      await tester.enterText(_field('Confirm password'), 'Demo@12345');
      await tester.tap(find.widgetWithText(FilledButton, 'Create account'));
      await tester.pump();
      await tester.pump();

      expect(repo.lastRegistration?['role'], UserRole.recycler);
      expect(repo.lastRegistration?['organizationName'], 'GreenCycle');
      expect(container.read(authControllerProvider).status,
          AuthStatus.authenticated);
    });
  });
}
