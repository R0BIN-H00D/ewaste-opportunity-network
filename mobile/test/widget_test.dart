import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/core/theme/glass_theme.dart';
import 'package:ewaste_opportunity/widgets/glass_container.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('GlassContainer renders its child under the light and dark themes', (tester) async {
    for (final theme in [AppTheme.light(), AppTheme.dark()]) {
      await tester.pumpWidget(
        MaterialApp(theme: theme, home: const Scaffold(body: GlassContainer(child: Text('hello')))),
      );
      expect(find.text('hello'), findsOneWidget);
    }
  });

  test('themes expose the glass extension', () {
    expect(AppTheme.light().extension<GlassTheme>(), isNotNull);
    expect(AppTheme.dark().extension<GlassTheme>(), isNotNull);
  });
}
