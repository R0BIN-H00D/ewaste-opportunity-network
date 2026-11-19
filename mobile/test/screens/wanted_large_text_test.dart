import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/user.dart';
import 'package:ewaste_opportunity/models/wanted.dart';
import 'package:ewaste_opportunity/providers/auth_controller.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/providers/wanted_providers.dart';
import 'package:ewaste_opportunity/screens/wanted/wanted_screens.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import '../helpers.dart';
import 'wanted_screens_test.dart' show FakeWantedRepository;

/// The wanted-devices screens on a small phone with the text made large: nothing may overflow, for any role.
const _long = WantedRequest(
  id: 'w1',
  title: 'Used laptops in good working order for a school computer lab',
  categoryName: 'Laptops and notebooks',
  brand: 'Lenovo or Dell',
  quantity: 25,
  minCondition: 'minor_damage',
  city: 'Bengaluru South',
  notes: 'Any model from the last six years is fine, with or without a charger. We collect from your door.',
  refurbisherName: 'Green Tech Refurbishers Private Limited',
  responseCount: 2,
);
const _done = WantedRequest(id: 'w2', title: 'Phones', quantity: 1, refurbisherName: 'Green Tech', hasResponded: true, status: 'closed');

Future<void> _show(WidgetTester tester, UserRole role, double scale, {bool dark = false}) async {
  tester.view.physicalSize = const Size(360, 740);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final repo = FakeWantedRepository(boardItems: const [_long, _done], mineItems: const [_long, _done]);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository(loginResult: sampleMe(role: role))),
        wantedRepositoryProvider.overrideWithValue(repo),
      ],
      child: MaterialApp(
        theme: dark ? AppTheme.dark() : AppTheme.light(),
        home: const WantedPage(),
        builder: (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)), child: child!),
      ),
    ),
  );
  final container = ProviderScope.containerOf(tester.element(find.byType(MaterialApp)));
  await container.read(authControllerProvider.notifier).signIn(email: 'a@b.c', password: 'x');
  for (var i = 0; i < 4; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  for (final role in [UserRole.user, UserRole.technician, UserRole.refurbisher]) {
    for (final scale in [1.0, 1.5, 2.0]) {
      testWidgets('${role.label}: wanted devices at $scale x text fit without overflow', (tester) async {
        await _show(tester, role, scale);
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('the refurbisher list fits in the dark theme too, with who accepted opened', (tester) async {
    await _show(tester, UserRole.refurbisher, 1.5, dark: true);
    await tester.ensureVisible(find.text('2 accepted'));
    // Past the "New request" button, which floats over the bottom of the list.
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -160));
    await tester.pump();
    await tester.tap(find.text('2 accepted'));
    for (var i = 0; i < 4; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(tester.takeException(), isNull);
  });
}
