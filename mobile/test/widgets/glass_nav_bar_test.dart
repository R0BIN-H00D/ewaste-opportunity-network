import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/widgets/glass_nav_bar.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

const _items = [
  NavItem(icon: Icons.home_outlined, selectedIcon: Icons.home, label: 'Home'),
  NavItem(icon: Icons.person_outline, selectedIcon: Icons.person, label: 'Account'),
];

void main() {
  testWidgets('the bar stays a small strip at the bottom and does not cover the screen', (tester) async {
    tester.view.physicalSize = const Size(1000, 2000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light(),
      home: Scaffold(
        extendBody: true,
        body: const SizedBox.expand(),
        bottomNavigationBar: GlassNavBar(items: _items, currentIndex: 0, onSelected: (_) {}),
      ),
    ));

    final bar = tester.getRect(find.byType(GlassNavBar));
    expect(bar.height, lessThan(160), reason: 'the bar must not take the height of the screen');
    expect(bar.bottom, closeTo(2000, 1));
  });

  testWidgets('items are at least 48 dp tall and taps are reported', (tester) async {
    int? tapped;
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light(),
      home: Scaffold(
        bottomNavigationBar: GlassNavBar(items: _items, currentIndex: 0, onSelected: (i) => tapped = i),
      ),
    ));

    expect(tester.getSize(find.widgetWithText(InkWell, 'Home')).height, greaterThanOrEqualTo(48));

    await tester.tap(find.text('Account'));
    expect(tapped, 1);
  });
}
