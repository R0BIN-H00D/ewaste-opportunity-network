import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/services/request_repository.dart';
import 'package:ewaste_opportunity/widgets/star_rating.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

Widget _host(Widget child) => MaterialApp(theme: AppTheme.light(), home: Scaffold(body: Center(child: child)));

void main() {
  testWidgets('as an input, each star is a 48 dp target named for a screen reader', (tester) async {
    final semantics = tester.ensureSemantics();
    var picked = 0;
    await tester.pumpWidget(_host(StatefulBuilder(builder: (context, setState) => StarRating(value: picked, label: 'Quality', onChanged: (n) => setState(() => picked = n)))));

    final third = find.bySemanticsLabel('Quality, 3 stars');
    expect(tester.getSize(third), const Size(48, 48));
    await tester.tap(third);
    await tester.pump();
    expect(picked, 3);
    expect(find.byIcon(Icons.star_rounded), findsNWidgets(3));
    semantics.dispose();
  });

  testWidgets('read-only, it says the value out of five', (tester) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(_host(const StarRating(value: 4, label: 'Rating')));
    expect(find.bySemanticsLabel('Rating: 4 out of 5 stars'), findsOneWidget);
    semantics.dispose();
  });

  test('a review sends only what was given', () {
    expect(const ReviewInput(rating: 5).toJson(), {'rating': 5});
    expect(const ReviewInput(rating: 3, quality: 4, comment: '  Good  ').toJson(), {'rating': 3, 'quality': 4, 'comment': 'Good'});
    expect(const ReviewInput(rating: 2, comment: '   ').toJson(), {'rating': 2});
  });
}
