import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../models/recycling_report.dart';
import '../../providers/recycling_providers.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';

/// "5 Nov 2026 to 16 Nov 2026", "From 5 Nov 2026", or "All time".
String reportPeriodText(DateTimeRange? range) => range == null ? 'All time' : '${formatDate(range.start)} to ${formatDate(range.end)}';

/// The recycling centre's activity report: requests by status, what was completed, and the materials recovered.
/// Measured and estimated weights stay in separate columns (BR-06).
class RecyclingReportScreen extends ConsumerWidget {
  const RecyclingReportScreen({super.key});

  Future<void> _choose(BuildContext context, WidgetRef ref) async {
    final now = DateTime.now();
    final current = ref.read(recyclingReportRangeProvider);
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 5),
      lastDate: now,
      initialDateRange: current,
      helpText: 'Report period',
    );
    if (picked != null) ref.read(recyclingReportRangeProvider.notifier).state = picked;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final range = ref.watch(recyclingReportRangeProvider);
    final report = ref.watch(recyclingReportProvider);
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final last30 = DateTimeRange(start: today.subtract(const Duration(days: 29)), end: today);
    final thisMonth = DateTimeRange(start: DateTime(now.year, now.month), end: today);
    bool same(DateTimeRange? a, DateTimeRange b) => a != null && a.start == b.start && a.end == b.end;
    void set(DateTimeRange? r) => ref.read(recyclingReportRangeProvider.notifier).state = r;

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Activity report'),
      body: AppBackground(
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: () async => ref.refresh(recyclingReportProvider.future),
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
              children: [
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(children: [
                    AppChip(label: 'All time', selected: range == null, onTap: () => set(null)),
                    const SizedBox(width: 8),
                    AppChip(label: 'This month', selected: same(range, thisMonth), onTap: () => set(thisMonth)),
                    const SizedBox(width: 8),
                    AppChip(label: 'Last 30 days', selected: same(range, last30), onTap: () => set(last30)),
                    const SizedBox(width: 8),
                    AppChip(label: 'Choose dates', selected: range != null && !same(range, thisMonth) && !same(range, last30), onTap: () => _choose(context, ref)),
                  ]),
                ),
                const SizedBox(height: 12),
                ...report.when(
                  skipLoadingOnReload: true,
                  loading: () => const [Skeleton(height: 120, radius: 24), SizedBox(height: 16), Skeleton(height: 200, radius: 24)],
                  error: (e, _) => [ErrorState(error: ApiException.from(e), onRetry: () => ref.invalidate(recyclingReportProvider))],
                  data: (r) => [_Report(report: r, period: reportPeriodText(range), theme: theme)],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Report extends StatelessWidget {
  const _Report({required this.report, required this.period, required this.theme});

  final RecyclingReport report;
  final String period;
  final ThemeData theme;

  /// A label and its value, the value at the right edge. At a large text size, or with a long value ("3 devices in 2
  /// requests"), the value drops to the next line instead of running off the screen.
  Widget _row(String label, String value, {bool bold = false}) => Padding(
        padding: const EdgeInsets.only(top: 6),
        child: SizedBox(
          width: double.infinity,
          child: Wrap(
            alignment: WrapAlignment.spaceBetween,
            spacing: 12,
            runSpacing: 2,
            children: [
              Text(label, style: theme.textTheme.bodyLarge),
              Text(value, style: theme.textTheme.bodyLarge?.copyWith(fontWeight: bold ? FontWeight.w700 : FontWeight.w500)),
            ],
          ),
        ),
      );

  Widget _title(String text) => Semantics(header: true, child: Text(text, style: theme.textTheme.titleLarge));

  @override
  Widget build(BuildContext context) {
    final r = report;
    final statuses = [for (final e in r.byStatus.entries) if (e.value > 0) e];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        GlassContainer(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _title(r.center),
              Text(period, style: theme.textTheme.bodyMedium),
              const SizedBox(height: 8),
              _row('Requests received', '${r.totalRequests}'),
              _row('Completed', '${r.completedCount}'),
              _row('Devices recycled', '${r.completedDevices}'),
            ],
          ),
        ),
        if (statuses.isNotEmpty) ...[
          const SizedBox(height: 16),
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _title('Requests by status'),
                for (final e in statuses) _row(recyclingStatusLabel(e.key, center: true), '${e.value}'),
              ],
            ),
          ),
        ],
        const SizedBox(height: 16),
        GlassContainer(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _title('Materials recovered'),
              Text('Measured weights come from the scale. Estimated weights are your own estimates. They are never added together.', style: theme.textTheme.bodyMedium),
              const SizedBox(height: 8),
              if (r.recovered.isEmpty)
                Text('No materials were recorded in this period.', style: theme.textTheme.bodyLarge)
              else ...[
                Row(
                  children: [
                    Expanded(child: Text('Material', style: theme.textTheme.bodyMedium)),
                    SizedBox(width: 90, child: Text('Measured', textAlign: TextAlign.end, style: theme.textTheme.bodyMedium)),
                    SizedBox(width: 90, child: Text('Estimated', textAlign: TextAlign.end, style: theme.textTheme.bodyMedium)),
                  ],
                ),
                for (final m in r.recovered)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Row(
                      children: [
                        Expanded(child: Text(labelOf(materialTypes, m.type), style: theme.textTheme.bodyLarge)),
                        SizedBox(width: 90, child: Text(m.actualKg > 0 ? formatKg(m.actualKg) : '–', textAlign: TextAlign.end, style: theme.textTheme.bodyLarge)),
                        SizedBox(width: 90, child: Text(m.estimatedKg > 0 ? formatKg(m.estimatedKg) : '–', textAlign: TextAlign.end, style: theme.textTheme.bodyLarge)),
                      ],
                    ),
                  ),
                const Divider(height: 20),
                Row(
                  children: [
                    Expanded(child: Text('Total', style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700))),
                    SizedBox(width: 90, child: Text(formatKg(r.totalActualKg), textAlign: TextAlign.end, style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700))),
                    SizedBox(width: 90, child: Text(formatKg(r.totalEstimatedKg), textAlign: TextAlign.end, style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700))),
                  ],
                ),
              ],
            ],
          ),
        ),
        if (r.byCategory.isNotEmpty) ...[
          const SizedBox(height: 16),
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _title('By kind of device'),
                for (final c in r.byCategory) _row(c.name, '${c.devices} ${c.devices == 1 ? 'device' : 'devices'} in ${c.requests} ${c.requests == 1 ? 'request' : 'requests'}'),
              ],
            ),
          ),
        ],
        if (r.items.isNotEmpty) ...[
          const SizedBox(height: 16),
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _title('Completed requests'),
                for (final i in r.items.take(20))
                  Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(i.refNo, style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700)),
                        Text('${formatDate(i.completedAt)} · ${i.deviceCount} ${i.deviceCount == 1 ? 'device' : 'devices'}${i.categories.isEmpty ? '' : ' · ${i.categories.join(', ')}'}', style: theme.textTheme.bodyMedium),
                      ],
                    ),
                  ),
                if (r.items.length > 20) Padding(padding: const EdgeInsets.only(top: 10), child: Text('And ${r.items.length - 20} more. Narrow the dates to see them.', style: theme.textTheme.bodyMedium)),
              ],
            ),
          ),
        ],
      ],
    );
  }
}
