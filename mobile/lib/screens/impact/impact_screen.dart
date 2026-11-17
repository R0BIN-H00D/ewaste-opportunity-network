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
import '../../widgets/green_ring.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';

/// The Green Score and the person's impact. Points come only from activities the other side has confirmed; weights that were
/// measured on a scale are shown apart from estimates, and CO2e is always called an estimate (BR-06).
class ImpactScreen extends ConsumerWidget {
  const ImpactScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(greenScoreProvider);
    ref.invalidate(impactSummaryProvider);
    ref.invalidate(monthlyImpactProvider);
    await ref.read(ledgerProvider.notifier).load();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final score = ref.watch(greenScoreProvider);
    final summary = ref.watch(impactSummaryProvider);
    final monthly = ref.watch(monthlyImpactProvider);

    return RefreshIndicator(
      onRefresh: () => _refresh(ref),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
        children: [
          score.when(
            loading: () => const Skeleton(height: 200, radius: 24),
            error: (e, _) => ErrorState(error: ApiException.from(e), onRetry: () => ref.invalidate(greenScoreProvider)),
            data: (s) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [_ScoreCard(score: s), const SizedBox(height: 16), _BadgesCard(badges: s.badges)],
            ),
          ),
          const SizedBox(height: 16),
          summary.when(
            loading: () => const Skeleton(height: 180, radius: 24),
            error: (e, _) => ErrorState(error: ApiException.from(e), onRetry: () => ref.invalidate(impactSummaryProvider)),
            data: (s) => _ImpactCard(summary: s),
          ),
          const SizedBox(height: 16),
          monthly.when(
            loading: () => const Skeleton(height: 240, radius: 24),
            error: (e, _) => ErrorState(error: ApiException.from(e), onRetry: () => ref.invalidate(monthlyImpactProvider)),
            data: (months) => _MonthlyCard(months: months),
          ),
          const SizedBox(height: 16),
          const _HistoryCard(),
          const SizedBox(height: 16),
          const _RulesCard(),
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
        appBar: glassAppBar(context, 'Green Score'),
        body: const AppBackground(child: SafeArea(child: ImpactScreen())),
      );
}

class _ScoreCard extends StatelessWidget {
  const _ScoreCard({required this.score});

  final GreenScore score;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final level = score.level;
    final next = level.isTop ? 'You have reached the highest level.' : '${level.pointsToNext(score.score)} more points to reach ${level.nextName}.';
    return GlassContainer(
      child: Column(
        children: [
          GreenRing(score: score.score, level: level, size: 148),
          const SizedBox(height: 12),
          Semantics(header: true, child: Text(level.name, style: theme.textTheme.headlineMedium)),
          const SizedBox(height: 2),
          Text(next, style: theme.textTheme.bodyMedium, textAlign: TextAlign.center),
          const SizedBox(height: 8),
          Text('Points come only from activities the other person has confirmed as done.', style: theme.textTheme.labelSmall, textAlign: TextAlign.center),
        ],
      ),
    );
  }
}

class _BadgesCard extends StatelessWidget {
  const _BadgesCard({required this.badges});

  final List<GreenBadge> badges;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final earned = badges.where((b) => b.earned).length;
    return GlassContainer(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(header: true, child: Text('Badges', style: theme.textTheme.titleLarge)),
          Text('$earned of ${badges.length} earned', style: theme.textTheme.bodyMedium),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final b in badges)
                Semantics(
                  label: b.earned ? '${b.name}, earned. ${b.description}' : '${b.name}, not yet earned. ${b.description} ${_progress(b)}',
                  excludeSemantics: true,
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 48),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: b.earned ? scheme.primary.withValues(alpha: 0.16) : Colors.transparent,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: b.earned ? scheme.primary : scheme.outline.withValues(alpha: 0.5)),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(b.earned ? Icons.workspace_premium : Icons.lock_outline, size: 18, color: b.earned ? scheme.primary : scheme.onSurface.withValues(alpha: 0.5)),
                            const SizedBox(width: 6),
                            // Flexible, so a long badge name wraps at a large text size instead of running off the screen.
                            Flexible(child: Text(b.name, style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700, color: b.earned ? null : scheme.onSurface.withValues(alpha: 0.7)))),
                          ],
                        ),
                        if (!b.earned) Text(_progress(b), style: theme.textTheme.labelSmall),
                      ],
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          for (final b in badges.where((b) => !b.earned).take(2))
            Padding(padding: const EdgeInsets.only(top: 4), child: Text('${b.name}: ${b.description}', style: theme.textTheme.bodyMedium)),
        ],
      ),
    );
  }

  static String _progress(GreenBadge b) => '${_n(b.done)} of ${_n(b.needed)}';
  static String _n(double v) => v == v.roundToDouble() ? v.round().toString() : v.toStringAsFixed(1);
}

class _ImpactCard extends StatelessWidget {
  const _ImpactCard({required this.summary});

  final ImpactSummary summary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    Widget row(String label, String value, {String? chip, String? help}) => Padding(
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
          Semantics(header: true, child: Text('Your impact', style: theme.textTheme.titleLarge)),
          if (summary.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('Nothing yet. When a repair, donation, sale or recycling you take part in is confirmed as done, it is counted here.', style: theme.textTheme.bodyLarge),
            )
          else ...[
            row('devices kept in use', '${summary.devicesTotal}', chip: 'Actual'),
            if (summary.byType.values.any((n) => n > 0))
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Wrap(spacing: 8, runSpacing: 8, children: [
                  for (final e in impactTypeLabels.entries)
                    if ((summary.byType[e.key] ?? 0) > 0) _Chip('${e.value} ${summary.byType[e.key]}'),
                ]),
              ),
            row('weighed at a recycling centre', formatWeight(summary.measuredKg), chip: 'Measured', help: 'Weighed on a scale.'),
            row('of materials, not weighed', formatWeight(summary.estimatedKg), chip: 'Estimate', help: 'Worked out from the kind of device, not measured.'),
            row('of CO₂ avoided, about', formatWeight(summary.co2eKg), chip: 'Estimate', help: 'Always an estimate, from placeholder figures that are not sourced yet.'),
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
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), border: Border.all(color: scheme.outline.withValues(alpha: 0.6))),
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
    final peak = months.fold<int>(1, (hi, m) => m.devices > hi ? m.devices : hi);
    final summary = months.where((m) => m.devices > 0).map((m) => '${formatMonthKey(m.month, withYear: true)}: ${m.devices}').join(', ');

    return GlassContainer(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(header: true, child: Text('Month by month', style: theme.textTheme.titleLarge)),
          Text('Devices kept in use each month. Counts of real, confirmed activity.', style: theme.textTheme.bodyMedium),
          const SizedBox(height: 12),
          if (total == 0)
            Text('Nothing in the last ${months.length} months.', style: theme.textTheme.bodyLarge)
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
                              getTitlesWidget: (v, meta) => v == v.roundToDouble() ? Text('${v.round()}', style: theme.textTheme.labelSmall) : const SizedBox.shrink())),
                      bottomTitles: AxisTitles(
                        sideTitles: SideTitles(
                          showTitles: true,
                          reservedSize: 28,
                          getTitlesWidget: (v, meta) {
                            final i = v.round();
                            // Every other month, counted back from the newest so the latest bar is always named (and the labels
                            // do not crowd each other on a narrow phone).
                            if (i < 0 || i >= months.length || (months.length > 6 && (months.length - 1 - i).isOdd)) return const SizedBox.shrink();
                            return Padding(padding: const EdgeInsets.only(top: 6), child: Text(formatMonthKey(months[i].month), style: theme.textTheme.labelSmall));
                          },
                        ),
                      ),
                    ),
                    barGroups: [
                      for (var i = 0; i < months.length; i++)
                        BarChartGroupData(x: i, barRods: [
                          BarChartRodData(toY: months[i].devices.toDouble(), width: 14, color: scheme.primary, borderRadius: const BorderRadius.vertical(top: Radius.circular(4))),
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

class _HistoryCard extends ConsumerWidget {
  const _HistoryCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final state = ref.watch(ledgerProvider);
    final notifier = ref.read(ledgerProvider.notifier);

    Widget body;
    if (state.loading && state.items.isEmpty) {
      body = const Padding(padding: EdgeInsets.only(top: 8), child: Skeleton(height: 80, radius: 16));
    } else if (state.error != null && state.items.isEmpty) {
      body = ErrorState(error: state.error!, onRetry: notifier.load);
    } else if (state.items.isEmpty) {
      body = Padding(padding: const EdgeInsets.only(top: 8), child: Text('Nothing earned yet.', style: theme.textTheme.bodyLarge));
    } else {
      body = Column(
        children: [
          for (final e in state.items)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    // The points column grows with the text size, or "+50" would not fit in it.
                    width: MediaQuery.textScalerOf(context).scale(56),
                    child: Text(e.points == 0 ? '0' : (e.points > 0 ? '+${e.points}' : '${e.points}'),
                        style: theme.textTheme.titleLarge?.copyWith(color: e.points < 0 ? theme.colorScheme.error : theme.colorScheme.primary)),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [Text(e.label, style: theme.textTheme.bodyLarge), Text(formatDate(e.at), style: theme.textTheme.labelSmall)],
                    ),
                  ),
                ],
              ),
            ),
          if (state.hasMore)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: TextButton(onPressed: state.loadingMore ? null : notifier.loadMore, child: Text(state.loadingMore ? 'Loading...' : 'Show more')),
            ),
        ],
      );
    }

    return GlassContainer(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Semantics(header: true, child: Text('How you earned it', style: theme.textTheme.titleLarge)), body]),
    );
  }
}

class _RulesCard extends ConsumerWidget {
  const _RulesCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final rules = ref.watch(scoringRulesProvider);
    return GlassContainer(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      // A transparent Material so the tile's ripple draws on the glass instead of under it.
      child: Material(
        type: MaterialType.transparency,
        child: Theme(
          data: theme.copyWith(dividerColor: Colors.transparent),
          child: ExpansionTile(
            title: Text('How points work', style: theme.textTheme.titleLarge),
            childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            expandedCrossAxisAlignment: CrossAxisAlignment.start,
            children: rules.when(
              loading: () => const [Skeleton(height: 80, radius: 16)],
              error: (e, _) => [ErrorState(error: ApiException.from(e), onRetry: () => ref.invalidate(scoringRulesProvider))],
              data: (r) => [
                for (final rule in r.rules)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(width: MediaQuery.textScalerOf(context).scale(48), child: Text('+${rule.points}', style: theme.textTheme.titleLarge?.copyWith(color: theme.colorScheme.primary))),
                        Expanded(child: Text(rule.label, style: theme.textTheme.bodyLarge)),
                      ],
                    ),
                  ),
                const SizedBox(height: 4),
                for (final n in r.notes) Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(n, style: theme.textTheme.bodyMedium)),
                if (r.method.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text(r.method, style: theme.textTheme.labelSmall)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
