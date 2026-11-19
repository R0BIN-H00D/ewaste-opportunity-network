import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_colors.dart';
import '../../models/recycling_report.dart';
import '../../providers/recycling_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/menu_section.dart';
import '../../widgets/page_banner.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';

String reportPeriodText(DateTimeRange? range) =>
    range == null ? 'All time' : '${formatDate(range.start)} to ${formatDate(range.end)}';

/// An activity report for the signed-in recycling centre.
class RecyclingReportScreen extends ConsumerWidget {
  const RecyclingReportScreen({super.key});

  Future<void> _choose(BuildContext context, WidgetRef ref, DateTime today) async {
    final current = ref.read(recyclingReportRangeProvider);
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(today.year - 5),
      lastDate: today,
      initialDateRange: current,
      helpText: 'Choose report dates',
    );
    if (context.mounted && picked != null) ref.read(recyclingReportRangeProvider.notifier).state = picked;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final range = ref.watch(recyclingReportRangeProvider);
    final report = ref.watch(recyclingReportProvider);
    final today = DateUtils.dateOnly(DateTime.now());
    final last30 = DateTimeRange(start: DateTime(today.year, today.month, today.day - 29), end: today);
    final thisMonth = DateTimeRange(start: DateTime(today.year, today.month), end: today);
    void set(DateTimeRange? next) => ref.read(recyclingReportRangeProvider.notifier).state = next;

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Recycling report'),
      body: AppBackground(
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: () => ref.refresh(recyclingReportProvider.future).then<void>((_) {}, onError: (Object _) {}),
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
              children: [
                _ReportPanel(title: 'Reporting period', children: [
                  Text(reportPeriodText(range), style: Theme.of(context).textTheme.bodyMedium),
                  const SizedBox(height: 10),
                  Wrap(spacing: 8, runSpacing: 6, children: [
                    ChoiceChip(label: const Text('All time'), selected: range == null, onSelected: (_) => set(null)),
                    ChoiceChip(
                        label: const Text('This month'),
                        selected: range == thisMonth && range != last30,
                        onSelected: (_) => set(thisMonth)),
                    ChoiceChip(
                        label: const Text('Last 30 days'), selected: range == last30, onSelected: (_) => set(last30)),
                  ]),
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: OutlinedButton.icon(
                      onPressed: () => _choose(context, ref, today),
                      icon: const Icon(Icons.date_range_outlined),
                      label: const Text('Choose dates'),
                    ),
                  ),
                ]),
                const SizedBox(height: 14),
                report.when(
                  loading: () => const Column(children: [
                    Skeleton(height: 92, radius: 24),
                    SizedBox(height: 14),
                    Skeleton(height: 140, radius: 20),
                  ]),
                  error: (error, _) => ErrorState(
                    error: ApiException.from(error),
                    onRetry: () => ref.invalidate(recyclingReportProvider),
                  ),
                  data: (data) => _Report(report: data),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

String _number(BuildContext context, int amount) => MaterialLocalizations.of(context).formatDecimal(amount);

class _Report extends StatelessWidget {
  const _Report({required this.report});
  final RecyclingReport report;

  @override
  Widget build(BuildContext context) {
    final r = report;
    final statuses = r.byStatus.entries.where((entry) => entry.value > 0).toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final categories = [...r.byCategory]..sort((a, b) => b.devices.compareTo(a.devices));
    final categoryPeak = categories.isEmpty || categories.first.devices == 0 ? 1 : categories.first.devices;
    final theme = Theme.of(context);
    final materials = r.recovered;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        PageBanner(
          icon: Icons.recycling_rounded,
          title: r.center,
          subtitle: 'Requests, recycling and recovered materials',
        ),
        const SizedBox(height: 14),
        _Metrics(items: [
          (Icons.inbox_outlined, AppColors.info, 'Requests received', _number(context, r.totalRequests)),
          (Icons.task_alt_rounded, AppColors.success, 'Requests completed', _number(context, r.completedCount)),
          (Icons.recycling_rounded, AppColors.tileAccents[5], 'Devices recycled', _number(context, r.completedDevices)),
        ]),
        const SizedBox(height: 16),
        _ReportPanel(title: 'Request status', children: [
          if (statuses.isEmpty)
            const Text('No requests were received in this period.')
          else ...[
            Text('Current status of requests received during this period.', style: theme.textTheme.bodySmall),
            const SizedBox(height: 12),
            for (final entry in statuses)
              _ReportBar(
                label: recyclingStatusLabel(entry.key, center: true),
                value: _number(context, entry.value),
                fraction: r.totalRequests == 0 ? 0 : entry.value / r.totalRequests,
                accent: switch (entry.key) {
                  'completed' => AppColors.success,
                  'requested' => AppColors.warning,
                  'rejected' => AppColors.danger,
                  'cancelled' => theme.colorScheme.outline,
                  _ => AppColors.info,
                },
              ),
          ],
        ]),
        const SizedBox(height: 16),
        _ReportPanel(title: 'Materials recovered', children: [
          if (materials.isEmpty)
            const Text('No materials were recorded in this period.')
          else ...[
            Text('Measured weights come from a scale. Estimates are shown separately.',
                style: theme.textTheme.bodySmall),
            const SizedBox(height: 12),
            _Metrics(items: [
              (Icons.scale_outlined, AppColors.success, 'Measured', formatKg(r.totalActualKg)),
              (Icons.calculate_outlined, AppColors.warning, 'Estimated', formatKg(r.totalEstimatedKg)),
            ]),
            const SizedBox(height: 10),
            for (final material in materials) ...[
              const Divider(height: 16),
              Text(labelOf(materialTypes, material.type), style: theme.textTheme.titleSmall),
              const SizedBox(height: 4),
              Wrap(spacing: 14, runSpacing: 4, children: [
                if (material.actualKg > 0) Text('Measured: ${formatKg(material.actualKg)}'),
                if (material.estimatedKg > 0) Text('Estimated: ${formatKg(material.estimatedKg)}'),
              ]),
            ],
          ],
        ]),
        if (categories.isNotEmpty) ...[
          const SizedBox(height: 16),
          _ReportPanel(title: 'Devices by category', children: [
            Text('A request can contain more than one category.', style: theme.textTheme.bodySmall),
            const SizedBox(height: 12),
            for (final category in categories)
              _ReportBar(
                label: category.name,
                value: '${_number(context, category.devices)} ${category.devices == 1 ? 'device' : 'devices'}',
                detail: '${_number(context, category.requests)} ${category.requests == 1 ? 'request' : 'requests'}',
                fraction: category.devices / categoryPeak,
                accent: AppColors.tileAccents[5],
              ),
          ]),
        ],
        if (r.items.isNotEmpty) ...[
          const SizedBox(height: 16),
          Semantics(header: true, child: Text('Completed requests', style: theme.textTheme.titleLarge)),
          const SizedBox(height: 8),
          MenuSection(rows: [
            for (final item in r.items.take(20))
              MenuRow(
                icon: Icons.task_alt_rounded,
                accent: AppColors.tileAccents[0],
                title: item.refNo.isEmpty ? 'Recycling request' : item.refNo,
                subtitle: [
                  if (item.completedAt != null) formatDate(item.completedAt),
                  '${_number(context, item.deviceCount)} ${item.deviceCount == 1 ? 'device' : 'devices'}',
                  if (item.categories.isNotEmpty) item.categories.join(', '),
                ].join(' · '),
                onTap: () => context.push(Routes.recyclingRequest(item.id)),
              ),
          ]),
          if (r.items.length > 20)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                  'Showing the latest 20 of ${_number(context, r.items.length)}. Narrow the dates to find a specific request.'),
            ),
        ],
      ],
    );
  }
}

class _ReportPanel extends StatelessWidget {
  const _ReportPanel({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => GlassContainer(
        radius: 22,
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Semantics(header: true, child: Text(title, style: Theme.of(context).textTheme.titleMedium)),
          const SizedBox(height: 8),
          ...children,
        ]),
      );
}

class _Metrics extends StatelessWidget {
  const _Metrics({required this.items});
  final List<(IconData, Color, String, String)> items;

  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (context, box) {
        final theme = Theme.of(context);
        final wide =
            box.maxWidth >= (items.length == 3 ? 318 : 248) && MediaQuery.textScalerOf(context).scale(16) <= 20;
        const gap = 8.0;
        final width = wide ? (box.maxWidth - gap * (items.length - 1)) / items.length : box.maxWidth;
        return Wrap(spacing: gap, runSpacing: gap, children: [
          for (final (icon, color, label, value) in items)
            SizedBox(
              width: width,
              child: GlassContainer(
                radius: 16,
                blur: 0,
                padding: const EdgeInsets.all(12),
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: wide ? 92 : 0),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    ExcludeSemantics(child: Icon(icon, size: 19, color: AppColors.adapt(context, color))),
                    const SizedBox(height: 5),
                    Text(value, style: theme.textTheme.titleLarge),
                    const SizedBox(height: 2),
                    Text(label, style: theme.textTheme.bodySmall),
                  ]),
                ),
              ),
            ),
        ]);
      });
}

class _ReportBar extends StatelessWidget {
  const _ReportBar(
      {required this.label, required this.value, required this.fraction, required this.accent, this.detail});
  final String label;
  final String value;
  final double fraction;
  final Color accent;
  final String? detail;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Wrap(alignment: WrapAlignment.spaceBetween, spacing: 12, runSpacing: 2, children: [
          Text(label, style: theme.textTheme.bodyMedium),
          Text(value, style: theme.textTheme.titleSmall),
        ]),
        const SizedBox(height: 5),
        ExcludeSemantics(
            child: LinearProgressIndicator(
          value: fraction.clamp(0.0, 1.0).toDouble(),
          color: AppColors.adapt(context, accent),
          backgroundColor: theme.colorScheme.outlineVariant.withValues(alpha: 0.5),
          minHeight: 7,
          borderRadius: BorderRadius.circular(8),
        )),
        if (detail != null) ...[
          const SizedBox(height: 3),
          Text(detail!, style: theme.textTheme.bodySmall),
        ],
      ]),
    );
  }
}
