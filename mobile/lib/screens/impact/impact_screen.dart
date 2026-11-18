import 'package:fl_chart/fl_chart.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../models/impact.dart';
import '../../providers/impact_providers.dart';
import '../../widgets/app_background.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';

/// The person's impact. It counts only activities the other side has confirmed; weights that were
/// measured on a scale are shown apart from estimates, and CO2e is always called an estimate (BR-06).
class ImpactScreen extends ConsumerWidget {
  const ImpactScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(impactSummaryProvider);
    ref.invalidate(monthlyImpactProvider);
    ref.invalidate(yearlyImpactProvider);
    ref.invalidate(categoryImpactProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(impactSummaryProvider);
    final monthly = ref.watch(monthlyImpactProvider);
    final yearly = ref.watch(yearlyImpactProvider);
    final categories = ref.watch(categoryImpactProvider);

    return RefreshIndicator(
      onRefresh: () => _refresh(ref),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
        children: [
          summary.when(
            loading: () => const Skeleton(height: 180, radius: 24),
            error: (e, _) => ErrorState(
                error: ApiException.from(e),
                onRetry: () => ref.invalidate(impactSummaryProvider)),
            data: (s) => _ImpactCard(summary: s),
          ),
          const SizedBox(height: 16),
          monthly.when(
            loading: () => const Skeleton(height: 240, radius: 24),
            error: (e, _) => ErrorState(
                error: ApiException.from(e),
                onRetry: () => ref.invalidate(monthlyImpactProvider)),
            data: (months) => _MonthlyCard(months: months),
          ),
          // These two are extras: when they cannot be loaded, or there is nothing yet, they are simply left out.
          if (yearly.valueOrNull != null &&
              hasActivity(yearly.valueOrNull!)) ...[
            const SizedBox(height: 16),
            _BarsCard(
                title: 'Year by year',
                subtitle:
                    'Devices kept in use each year. Counts of real, confirmed activity.',
                rows: yearly.valueOrNull!),
          ],
          if (categories.valueOrNull != null &&
              hasActivity(categories.valueOrNull!)) ...[
            const SizedBox(height: 16),
            _BarsCard(
                title: 'By kind of device',
                subtitle: 'Which devices your confirmed activity was about.',
                rows: categories.valueOrNull!),
          ],
        ],
      ),
    );
  }
}

class ImpactPage extends StatelessWidget {
  const ImpactPage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        extendBodyBehindAppBar: true,
        appBar: glassAppBar(context, 'My impact'),
        body: const AppBackground(child: SafeArea(child: ImpactScreen())),
      );
}

class _ImpactCard extends StatelessWidget {
  const _ImpactCard({required this.summary});

  final ImpactSummary summary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    Widget row(String label, String value, {String? chip, String? help}) =>
        Padding(
          padding: const EdgeInsets.only(top: 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: 8,
                runSpacing: 2,
                children: [
                  Text(value, style: theme.textTheme.titleLarge),
                  Text(label, style: theme.textTheme.bodyLarge),
                  if (chip != null) _Chip(chip),
                ],
              ),
              if (help != null) Text(help, style: theme.textTheme.bodyMedium),
            ],
          ),
        );

    return GlassContainer(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
              header: true,
              child: Text('Your impact', style: theme.textTheme.titleLarge)),
          if (summary.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                  'Nothing yet. When a repair, donation, sale or recycling you take part in is confirmed as done, it is counted here.',
                  style: theme.textTheme.bodyLarge),
            )
          else ...[
            row('devices kept in use', '${summary.devicesTotal}',
                chip: 'Actual'),
            if (summary.byType.values.any((n) => n > 0))
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Wrap(spacing: 8, runSpacing: 8, children: [
                  for (final e in impactTypeLabels.entries)
                    if ((summary.byType[e.key] ?? 0) > 0)
                      _Chip('${e.value} ${summary.byType[e.key]}'),
                ]),
              ),
            row('weighed at a recycling centre',
                formatWeight(summary.measuredKg),
                chip: 'Measured', help: 'Weighed on a scale.'),
            row('of materials, not weighed', formatWeight(summary.estimatedKg),
                chip: 'Estimate',
                help: 'Worked out from the kind of device, not measured.'),
            row('of CO₂ avoided, about', formatWeight(summary.co2eKg),
                chip: 'Estimate',
                help:
                    'Always an estimate, from placeholder figures that are not sourced yet.'),
          ],
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: scheme.outline.withValues(alpha: 0.6))),
      child: Text(text, style: Theme.of(context).textTheme.labelSmall),
    );
  }
}

class _MonthlyCard extends StatelessWidget {
  const _MonthlyCard({required this.months});

  final List<MonthImpact> months;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final total = months.fold<int>(0, (sum, m) => sum + m.devices);
    final peak =
        months.fold<int>(1, (hi, m) => m.devices > hi ? m.devices : hi);
    final summary = months
        .where((m) => m.devices > 0)
        .map((m) => '${formatMonthKey(m.month, withYear: true)}: ${m.devices}')
        .join(', ');

    return GlassContainer(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
              header: true,
              child: Text('Month by month', style: theme.textTheme.titleLarge)),
          Text(
              'Devices kept in use each month. Counts of real, confirmed activity.',
              style: theme.textTheme.bodyMedium),
          const SizedBox(height: 12),
          if (total == 0)
            Text('Nothing in the last ${months.length} months.',
                style: theme.textTheme.bodyLarge)
          else
            Semantics(
              label: 'Bar chart of devices kept in use by month. $summary.',
              excludeSemantics: true,
              child: SizedBox(
                height: 200,
                child: BarChart(
                  BarChartData(
                    maxY: (peak + 1).toDouble(),
                    gridData: const FlGridData(drawVerticalLine: false),
                    borderData: FlBorderData(show: false),
                    barTouchData: BarTouchData(enabled: false),
                    titlesData: FlTitlesData(
                      topTitles: const AxisTitles(),
                      rightTitles: const AxisTitles(),
                      leftTitles: AxisTitles(
                          sideTitles: SideTitles(
                              showTitles: true,
                              reservedSize: 28,
                              interval: peak > 6 ? null : 1,
                              getTitlesWidget: (v, meta) =>
                                  v == v.roundToDouble()
                                      ? Text('${v.round()}',
                                          style: theme.textTheme.labelSmall)
                                      : const SizedBox.shrink())),
                      bottomTitles: AxisTitles(
                        sideTitles: SideTitles(
                          showTitles: true,
                          reservedSize: 28,
                          getTitlesWidget: (v, meta) {
                            final i = v.round();
                            // Every other month, counted back from the newest so the latest bar is always named (and the labels
                            // do not crowd each other on a narrow phone).
                            if (i < 0 ||
                                i >= months.length ||
                                (months.length > 6 &&
                                    (months.length - 1 - i).isOdd))
                              return const SizedBox.shrink();
                            return Padding(
                                padding: const EdgeInsets.only(top: 6),
                                child: Text(formatMonthKey(months[i].month),
                                    style: theme.textTheme.labelSmall));
                          },
                        ),
                      ),
                    ),
                    barGroups: [
                      for (var i = 0; i < months.length; i++)
                        BarChartGroupData(x: i, barRods: [
                          BarChartRodData(
                              toY: months[i].devices.toDouble(),
                              width: 14,
                              color: scheme.primary,
                              borderRadius: const BorderRadius.vertical(
                                  top: Radius.circular(4))),
                        ]),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _BarsCard extends StatelessWidget {
  const _BarsCard(
      {required this.title, required this.subtitle, required this.rows});

  final String title;
  final String subtitle;
  final List<BreakdownRow> rows;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final peak = rows.fold<int>(1, (hi, r) => r.devices > hi ? r.devices : hi);
    return GlassContainer(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
              header: true,
              child: Text(title, style: theme.textTheme.titleLarge)),
          Text(subtitle, style: theme.textTheme.bodyMedium),
          const SizedBox(height: 12),
          for (final r in rows)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Semantics(
                label:
                    '${r.label}: ${r.devices} ${r.devices == 1 ? 'device' : 'devices'}${r.detail.isEmpty ? '' : ', ${r.detail}'}',
                excludeSemantics: true,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Expanded(
                          child: Text(r.label,
                              style: theme.textTheme.bodyLarge
                                  ?.copyWith(fontWeight: FontWeight.w600))),
                      Text('${r.devices}', style: theme.textTheme.bodyLarge),
                    ]),
                    const SizedBox(height: 4),
                    ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: LinearProgressIndicator(
                            value: r.devices / peak, minHeight: 8)),
                    if (r.detail.isNotEmpty)
                      Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child:
                              Text(r.detail, style: theme.textTheme.bodySmall)),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
