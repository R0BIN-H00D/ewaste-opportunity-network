import 'package:ewaste_opportunity/core/format.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/widgets/saved_data_banner.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

class _Counter extends StatefulWidget {
  const _Counter();

  static int created = 0;

  @override
  State<_Counter> createState() => _CounterState();
}

class _CounterState extends State<_Counter> {
  @override
  void initState() {
    super.initState();
    _Counter.created++;
  }

  @override
  Widget build(BuildContext context) => const Scaffold(body: Text('the app'));
}

Future<ProviderContainer> _pump(WidgetTester tester) async {
  _Counter.created = 0;
  final container = ProviderContainer();
  addTearDown(container.dispose);
  await tester.pumpWidget(UncontrolledProviderScope(
    container: container,
    child: const MaterialApp(home: SavedDataBanner(child: _Counter())),
  ));
  return container;
}

void main() {
  testWidgets('shows only the app while the server answers', (tester) async {
    await _pump(tester);
    expect(find.text('the app'), findsOneWidget);
    expect(find.textContaining('No connection'), findsNothing);
  });

  testWidgets('says when the data was saved, and goes when the server answers again', (tester) async {
    final container = await _pump(tester);
    final saved = DateTime(2026, 11, 16, 15, 5);

    container.read(savedDataSinceProvider.notifier).state = saved;
    await tester.pump();
    expect(find.text('No connection. Showing what was saved at ${formatSavedAt(saved)}.'), findsOneWidget);
    expect(find.text('the app'), findsOneWidget);

    container.read(savedDataSinceProvider.notifier).state = null;
    await tester.pump();
    expect(find.textContaining('No connection'), findsNothing);
    expect(find.text('the app'), findsOneWidget);
  });

  testWidgets('the screens below are not rebuilt from scratch when the notice comes and goes', (tester) async {
    final container = await _pump(tester);
    expect(_Counter.created, 1);
    container.read(savedDataSinceProvider.notifier).state = DateTime(2026, 11, 16, 15, 5);
    await tester.pump();
    container.read(savedDataSinceProvider.notifier).state = null;
    await tester.pump();
    expect(_Counter.created, 1);
  });

  testWidgets('the client callbacks drive the notice', (tester) async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final client = container.read(apiClientProvider);
    final at = DateTime(2026, 11, 16, 15, 5);
    client.onServedFromCache!(at);
    expect(container.read(savedDataSinceProvider), at);
    client.onFreshData!();
    expect(container.read(savedDataSinceProvider), isNull);
  });
}
