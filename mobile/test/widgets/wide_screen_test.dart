import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/widgets/app_background.dart';
import 'package:ewaste_opportunity/widgets/glass_container.dart';
import 'package:ewaste_opportunity/widgets/glass_nav_bar.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

const _items = [
  NavItem(icon: Icons.home_outlined, selectedIcon: Icons.home, label: 'Home'),
  NavItem(icon: Icons.person_outline, selectedIcon: Icons.person, label: 'Account'),
];

Future<void> _show(WidgetTester tester, Size size, Widget home) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(theme: AppTheme.light(), home: home));
}

void main() {
  const key = Key('content');

  group('AppBackground on wide screens', () {
    testWidgets('keeps a tablet-width page to a readable column but fills the whole screen with the gradient', (tester) async {
      await _show(tester, const Size(1200, 800), const Scaffold(body: AppBackground(child: SizedBox.expand(key: key))));
      expect(tester.getSize(find.byKey(key)).width, maxContentWidth);
      expect(tester.getSize(find.byKey(key)).height, 800, reason: 'height must stay tight so lists and Expanded still work');
      expect(tester.getTopLeft(find.byKey(key)).dx, (1200 - maxContentWidth) / 2);
      expect(tester.getSize(find.byType(AppBackground)).width, 1200);
    });

    testWidgets('a phone keeps the full width', (tester) async {
      await _show(tester, const Size(360, 740), const Scaffold(body: AppBackground(child: SizedBox.expand(key: key))));
      expect(tester.getSize(find.byKey(key)), const Size(360, 740));
    });

    testWidgets('a phone turned sideways is still within the limit', (tester) async {
      await _show(tester, const Size(700, 360), const Scaffold(body: AppBackground(child: SizedBox.expand(key: key))));
      expect(tester.getSize(find.byKey(key)).width, 700);
    });
  });

  group('GlassNavBar on wide screens', () {
    testWidgets('stays narrow and short instead of stretching over the screen', (tester) async {
      await _show(
        tester,
        const Size(1200, 800),
        Scaffold(extendBody: true, body: const SizedBox.expand(), bottomNavigationBar: GlassNavBar(items: _items, currentIndex: 0, onSelected: (_) {})),
      );
      // The glass pill itself, not the widget around it, which spans the screen.
      final bar = tester.getSize(find.descendant(of: find.byType(GlassNavBar), matching: find.byType(GlassContainer)));
      expect(bar.width, lessThanOrEqualTo(560));
      expect(bar.height, lessThan(120));
      expect(find.text('Home'), findsOneWidget);
    });

    testWidgets('is a small bar in the middle of a phone-width screen', (tester) async {
      await _show(
        tester,
        const Size(360, 740),
        Scaffold(extendBody: true, body: const SizedBox.expand(), bottomNavigationBar: GlassNavBar(items: _items, currentIndex: 0, onSelected: (_) {})),
      );
      final bar = find.descendant(of: find.byType(GlassNavBar), matching: find.byType(GlassContainer));
      expect(tester.getSize(bar).width, GlassNavBar.maxWidth);
      expect(tester.getSize(bar).height, lessThan(64));
      expect(tester.getCenter(bar).dx, closeTo(180, 1));
    });
  });
}
