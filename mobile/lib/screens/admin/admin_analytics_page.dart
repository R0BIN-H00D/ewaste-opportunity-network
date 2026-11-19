import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_colors.dart';
import '../../services/admin_repository.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/state_views.dart';
import 'admin_analytics_charts.dart';
import 'admin_catalog.dart';
import 'admin_files.dart';
import 'admin_form.dart';
import 'admin_widgets.dart';

class AdminAnalyticsPage extends ConsumerStatefulWidget {
  const AdminAnalyticsPage({super.key});

  @override
  ConsumerState<AdminAnalyticsPage> createState() => _AdminAnalyticsPageState();
}

class _AdminAnalyticsPageState extends ConsumerState<AdminAnalyticsPage> {
  int _months = 12;
  _Trend _trend = _Trend.signups;
  late var _data = _fetch();
  AdminRepository get _repo => ref.read(adminRepositoryProvider);
  Future<AdminRecord> _fetch() => _repo.record('analytics', query: {'months': _months});

  Future<void> _export(String kind) async {
    await showAdminForm(
      context,
      title: 'Export ${adminLabel(kind).toLowerCase()}',
      button: 'Save CSV',
      fields: exportFilters(kind),
      explanation: 'Choose optional filters, then select where to save the CSV.',
      onSubmit: (values) async {
        final file = await _repo.export(kind, {
          for (final entry in values.entries)
            if (entry.value != '') entry.key: entry.value
        });
        final bool saved;
        try {
          saved = await saveAdminCsv(file);
        } catch (_) {
          throw const ApiException('The CSV could not be saved. Try choosing another location.');
        }
        if (!saved) return false;
        if (mounted) {
          final count = file.rows == null ? '' : ' (${file.rows} rows)';
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(
                'Saved ${file.name}$count.${file.truncated ? ' The export was limited to the first 10,000 rows.' : ''}'),
          ));
        }
        return true;
      },
    );
  }

  void _selectPeriod(int months) {
    if (_months == months) return;
    setState(() {
      _months = months;
      _data = _fetch();
    });
  }

  @override
  Widget build(BuildContext context) => AdminScaffold(
        title: 'Analytics',
        child: FutureBuilder<AdminRecord>(
          future: _data,
          builder: (context, snapshot) {
            final loading = snapshot.connectionState != ConnectionState.done;
            final data = snapshot.data;
            final period = adminRecord(data?['period']);
            return ListView(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
              children: [
                AdminPanel(title: 'Reporting period', children: [
                  Wrap(spacing: 8, runSpacing: 4, children: [
                    for (final months in [3, 6, 12, 24])
                      ChoiceChip(
                        label: Text('$months months'),
                        selected: months == _months,
                        onSelected: (_) => _selectPeriod(months),
                      ),
                  ]),
                  const SizedBox(height: 8),
                  if (!loading && period['from'] is String && period['to'] is String)
                    Text(
                      '${formatMonthKey(period['from'], withYear: true)} – ${formatMonthKey(period['to'], withYear: true)} (UTC)',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  const SizedBox(height: 6),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: MenuAnchor(
                      builder: (context, controller, _) => OutlinedButton.icon(
                        onPressed: controller.isOpen ? controller.close : controller.open,
                        icon: const Icon(Icons.download_outlined),
                        label: const Text('Export CSV'),
                      ),
                      menuChildren: [
                        for (final kind in exportKinds)
                          MenuItemButton(onPressed: () => _export(kind), child: Text(adminLabel(kind))),
                      ],
                    ),
                  ),
                ]),
                const SizedBox(height: 16),
                if (loading)
                  const LinearProgressIndicator()
                else if (snapshot.hasError)
                  ErrorState(error: ApiException.from(snapshot.error!), onRetry: () => setState(() => _data = _fetch()))
                else if (data != null)
                  _AnalyticsReport(
                      data: data, trend: _trend, onTrendChanged: (trend) => setState(() => _trend = trend)),
              ],
            );
          },
        ),
      );
}

const _services = [
  (key: 'repairs', label: 'Repairs'),
  (key: 'donations', label: 'Donations'),
  (key: 'refurbishment', label: 'Refurbishment'),
  (key: 'recycling', label: 'Recycling'),
];

enum _Trend {
  signups(
      'Sign-ups', 'New sign-ups by month', [(key: 'members', label: 'Members'), (key: 'providers', label: 'Providers')],
      bars: true),
  growth('Growth', 'Platform growth', [(key: 'total', label: 'People')]),
  services('Services', 'Services started by month', _services),
  donations(
      'Donations', 'Donations by month', [(key: 'offered', label: 'Offered'), (key: 'completed', label: 'Completed')],
      bars: true),
  recycling('Recycling', 'Recycling requests by month',
      [(key: 'requests', label: 'Requested'), (key: 'completed', label: 'Completed')],
      bars: true);

  const _Trend(this.label, this.title, this.series, {this.bars = false});
  final String label;
  final String title;
  final List<TrendSeries> series;
  final bool bars;

  List<AdminRecord> rows(AdminRecord data) => adminRecords(switch (this) {
        signups => adminRecord(data['registrations'])['series'],
        growth => data['growth'],
        services => data['activity'],
        donations => adminRecord(data['donations'])['series'],
        recycling => adminRecord(data['recycling'])['series'],
      });
}

class _AnalyticsReport extends StatelessWidget {
  const _AnalyticsReport({required this.data, required this.trend, required this.onTrendChanged});
  final AdminRecord data;
  final _Trend trend;
  final ValueChanged<_Trend> onTrendChanged;

  @override
  Widget build(BuildContext context) {
    final registration = adminRecord(data['registrations']);
    final growth = adminRecords(data['growth']);
    final impact = adminRecord(data['impact']);
    final services = adminRecord(data['services']);
    final recycling = adminRecord(data['recycling']);
    final completed =
        services.values.fold<num>(0, (total, item) => total + analyticsNumber(adminRecord(item), 'completed'));
    final started =
        services.values.fold<num>(0, (total, item) => total + analyticsNumber(adminRecord(item), 'created'));
    String count(num value) => analyticsCount(context, value);

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _Metrics(items: [
        (Icons.person_add_alt_1_outlined, 0, 'New sign-ups', count(analyticsNumber(registration, 'total'))),
        (
          Icons.groups_outlined,
          1,
          'People on platform',
          count(analyticsNumber(growth.lastOrNull ?? const {}, 'total'))
        ),
        (Icons.task_alt_rounded, 2, 'Services completed', '${count(completed)} of ${count(started)}'),
        (Icons.recycling_rounded, 5, 'Devices recycled', count(analyticsNumber(recycling, 'devices'))),
      ]),
      const SizedBox(height: 16),
      AdminPanel(title: 'Monthly trends', children: [
        Wrap(spacing: 8, runSpacing: 4, children: [
          for (final option in _Trend.values)
            ChoiceChip(
              label: Text(option.label),
              selected: trend == option,
              onSelected: (_) => onTrendChanged(option),
            ),
        ]),
        const SizedBox(height: 14),
        AdminMonthlyChart(
          key: ValueKey(trend),
          title: trend.title,
          rows: trend.rows(data),
          series: trend.series,
          bars: trend.bars,
        ),
      ]),
      const SizedBox(height: 16),
      AdminPanel(title: 'Sign-ups by role', children: [
        _BreakdownBars(
          rows: [
            for (final item in adminRecord(registration['byRole']).entries)
              (adminLabel(item.key), item.value as num? ?? 0),
          ],
          empty: 'No new sign-ups in this period.',
        ),
      ]),
      const SizedBox(height: 16),
      AdminPanel(title: 'Service completion', children: [
        for (final (index, service) in _services.indexed)
          _CompletionRow(
            label: service.label,
            started: analyticsNumber(adminRecord(services[service.key]), 'created'),
            completed: analyticsNumber(adminRecord(services[service.key]), 'completed'),
            accent: AppColors.tileAccents[index],
          ),
      ]),
      const SizedBox(height: 16),
      AdminPanel(title: 'Listings by category', children: [
        _BreakdownBars(
          rows: [
            for (final item in adminRecords(data['categories']))
              ((item['name'] ?? 'Other').toString(), analyticsNumber(item, 'count')),
          ],
          empty: 'No devices were listed in this period.',
        ),
      ]),
      const SizedBox(height: 16),
      AdminPanel(title: 'Verified environmental impact', children: [
        _ImpactValue(label: 'Verified events', value: count(analyticsNumber(impact, 'events'))),
        _ImpactValue(label: 'Devices', value: count(analyticsNumber(impact, 'devices'))),
        _ImpactValue(label: 'Weighed materials', value: formatKg(analyticsNumber(impact, 'weighedKg'))),
        _ImpactValue(label: 'Estimated materials', value: formatKg(analyticsNumber(impact, 'estimatedKg'))),
        _ImpactValue(label: 'Estimated CO₂e', value: formatKg(analyticsNumber(impact, 'co2eEstimateKg'))),
      ]),
    ]);
  }
}

class _Metrics extends StatelessWidget {
  const _Metrics({required this.items});
  final List<(IconData, int, String, String)> items;

  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (context, box) {
        final theme = Theme.of(context);
        final columns = box.maxWidth < 300 || MediaQuery.textScalerOf(context).scale(16) > 23
            ? 1
            : box.maxWidth >= 620
                ? 4
                : 2;
        const gap = 10.0;
        final width = (box.maxWidth - (columns - 1) * gap) / columns;
        return Wrap(
          spacing: gap,
          runSpacing: gap,
          children: [
            for (final (icon, accent, label, value) in items)
              SizedBox(
                width: width,
                child: GlassContainer(
                  radius: 20,
                  padding: const EdgeInsets.all(14),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: 83),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Icon(icon, color: AppColors.adapt(context, AppColors.tileAccents[accent]), size: 20),
                      const SizedBox(height: 6),
                      Text(value, style: theme.textTheme.headlineSmall),
                      const SizedBox(height: 2),
                      Text(label, style: theme.textTheme.bodySmall),
                    ]),
                  ),
                ),
              ),
          ],
        );
      });
}

class _CompletionRow extends StatelessWidget {
  const _CompletionRow({required this.label, required this.started, required this.completed, required this.accent});
  final String label;
  final num started;
  final num completed;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final progress = started > 0 ? (completed / started).clamp(0.0, 1.0).toDouble() : 0.0;
    return _ReportBar(
      label: label,
      value: started > 0 ? '${(progress * 100).round()}%' : '—',
      fraction: progress,
      accent: accent,
      detail: '${analyticsCount(context, completed)} completed · ${analyticsCount(context, started)} started',
    );
  }
}

class _BreakdownBars extends StatelessWidget {
  const _BreakdownBars({required this.rows, required this.empty});
  final List<(String, num)> rows;
  final String empty;

  @override
  Widget build(BuildContext context) {
    final peak = rows.fold<num>(0, (maximum, entry) => entry.$2 > maximum ? entry.$2 : maximum);
    if (peak == 0) return Text(empty);
    return Column(children: [
      for (final (label, value) in rows)
        _ReportBar(
            label: label, value: analyticsCount(context, value), fraction: (value / peak).clamp(0.0, 1.0).toDouble()),
    ]);
  }
}

class _ReportBar extends StatelessWidget {
  const _ReportBar({required this.label, required this.value, required this.fraction, this.accent, this.detail});
  final String label;
  final String value;
  final double fraction;
  final Color? accent;
  final String? detail;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _ImpactValue(label: label, value: value),
        const SizedBox(height: 5),
        ExcludeSemantics(
          child: LinearProgressIndicator(
            value: fraction,
            minHeight: 7,
            color: accent == null ? theme.colorScheme.primary : AppColors.adapt(context, accent!),
            backgroundColor: theme.colorScheme.outlineVariant.withValues(alpha: 0.5),
            borderRadius: const BorderRadius.all(Radius.circular(6)),
          ),
        ),
        if (detail != null) ...[
          const SizedBox(height: 4),
          Text(detail!, style: theme.textTheme.bodySmall),
        ],
      ]),
    );
  }
}

class _ImpactValue extends StatelessWidget {
  const _ImpactValue({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(children: [
          Expanded(child: Text(label)),
          const SizedBox(width: 8),
          Flexible(child: Text(value, textAlign: TextAlign.end, style: Theme.of(context).textTheme.titleSmall)),
        ]),
      );
}
