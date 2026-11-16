import 'package:ewaste_opportunity/widgets/app_chip.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

void main() {
  testWidgets('chips in a Wrap sit side by side and are at least 44 high, not stretched to the full width', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SizedBox(
          width: 360,
          child: Wrap(spacing: 8, runSpacing: 8, children: [
            AppChip(label: 'Laptop', selected: false, onTap: () {}),
            AppChip(label: 'Phone', selected: true, onTap: () {}),
          ]),
        ),
      ),
    ));

    final first = tester.getSize(find.byType(AppChip).first);
    final second = tester.getSize(find.byType(AppChip).last);
    expect(first.width, lessThan(200));
    expect(second.width, lessThan(200));
    expect(first.height, greaterThanOrEqualTo(44));
    // Both on one line.
    expect(tester.getTopLeft(find.byType(AppChip).first).dy, tester.getTopLeft(find.byType(AppChip).last).dy);
  });

  testWidgets('tapping a chip calls back', (tester) async {
    var taps = 0;
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: AppChip(label: 'Repair', selected: false, onTap: () => taps++))));
    await tester.tap(find.text('Repair'));
    expect(taps, 1);
  });
}
