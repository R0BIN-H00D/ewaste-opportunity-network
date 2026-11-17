import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/network/api_exception.dart';
import '../../models/pickup.dart';
import '../../providers/pickup_providers.dart';
import '../../widgets/skeleton.dart';
import '../requests/request_dialogs.dart';

const _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const _months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];

/// "Wed 18 Nov", or "Today" / "Tomorrow" for the next two days. [today] is for tests.
String slotDayLabel(String date, {DateTime? today}) {
  final d = DateTime.tryParse(date);
  if (d == null) return date;
  final n = today ?? DateTime.now();
  final diff = DateTime(d.year, d.month, d.day)
      .difference(DateTime(n.year, n.month, n.day))
      .inDays;
  if (diff == 0) return 'Today';
  if (diff == 1) return 'Tomorrow';
  return '${_weekdays[d.weekday - 1]} ${d.day} ${_months[d.month - 1]}';
}

/// Lets the person pick a collection window from the ones the server says are open (FR-PICK-001). Pops with the choice,
/// or `null` if they back out. If the windows cannot be fetched they can still choose a date and time themselves.
Future<PickupChoice?> pickPickupSlot(BuildContext context) {
  return showModalBottomSheet<PickupChoice>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => const _SlotSheet(),
  );
}

class _SlotSheet extends ConsumerStatefulWidget {
  const _SlotSheet();

  @override
  ConsumerState<_SlotSheet> createState() => _SlotSheetState();
}

class _SlotSheetState extends ConsumerState<_SlotSheet> {
  String? _day;
  PickupSlot? _slot;

  Future<void> _manual() async {
    final when = await pickPickupTime(context);
    if (when != null && mounted) {
      Navigator.pop(context, PickupChoice(date: when));
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final slots = ref.watch(pickupSlotsProvider);

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: slots.when(
          loading: () =>
              const Column(mainAxisSize: MainAxisSize.min, children: [
            Skeleton(height: 40, radius: 12),
            SizedBox(height: 12),
            Skeleton(height: 120, radius: 12)
          ]),
          error: (e, _) => Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Choose a time', style: theme.textTheme.titleLarge),
              const SizedBox(height: 8),
              Text(e is ApiException
                  ? e.message
                  : 'Could not load the available times.'),
              const SizedBox(height: 12),
              Wrap(spacing: 8, children: [
                FilledButton(
                    onPressed: () => ref.invalidate(pickupSlotsProvider),
                    child: const Text('Try again')),
                OutlinedButton(
                    onPressed: _manual,
                    child: const Text('Pick a time myself')),
              ]),
            ],
          ),
          data: (catalogue) {
            final days = [
              for (final d in catalogue.days)
                if (d.hasOpen) d
            ];
            if (days.isEmpty) {
              return Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Choose a time', style: theme.textTheme.titleLarge),
                    const SizedBox(height: 8),
                    const Text('No times are open in the next two weeks.'),
                    const SizedBox(height: 12),
                    OutlinedButton(
                        onPressed: _manual,
                        child: const Text('Pick a time myself')),
                  ]);
            }
            final current = days.firstWhere((d) => d.date == _day,
                orElse: () => days.first);
            return SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Semantics(
                      header: true,
                      child: Text('Choose a time',
                          style: theme.textTheme.titleLarge)),
                  const SizedBox(height: 4),
                  Text(
                    'Times are in India time. You can change a booking until ${catalogue.cutoffHours} hours before it starts, up to ${catalogue.maxReschedules} times.',
                    style: theme.textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 12),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        for (final d in days) ...[
                          ChoiceChip(
                            label: Text(slotDayLabel(d.date)),
                            selected: d.date == current.date,
                            onSelected: (_) => setState(() {
                              _day = d.date;
                              _slot = null;
                            }),
                          ),
                          const SizedBox(width: 8),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final s in current.slots)
                        ChoiceChip(
                          label: Text('${s.label} · ${s.hours}'),
                          selected: _slot?.key == s.key && current.date == _day,
                          // A closed window stays visible but cannot be chosen, so it is clear why the day looks shorter.
                          onSelected: s.available
                              ? (_) => setState(() {
                                    _day = current.date;
                                    _slot = s;
                                  })
                              : null,
                          tooltip: s.available
                              ? null
                              : (s.reason == 'busy'
                                  ? 'You already have something then'
                                  : 'Starts too soon'),
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _slot == null || current.date != _day
                          ? null
                          : () => Navigator.pop(
                              context,
                              PickupChoice(
                                  date: _slot!.start, slot: _slot!.key)),
                      child: const Text('Use this time'),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}
