import 'package:fl_chart/fl_chart.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/theme/app_colors.dart';
import '../../services/admin_repository.dart';

typedef TrendSeries = ({String key, String label});

String analyticsCount(BuildContext context, num value) =>
    MaterialLocalizations.of(context).formatDecimal(value.round());

num analyticsNumber(AdminRecord record, String key) => (record[key] as num?) ?? 0;

class AdminMonthlyChart extends StatelessWidget {
  const AdminMonthlyChart(
      {super.key, required this.title, required this.rows, required this.series, this.bars = false});

  final String title;
  final List<AdminRecord> rows;
  final List<TrendSeries> series;
  final bool bars;

  static const _palette = [0, 1, 2, 3];

  String _month(int index, {bool withYear = false}) =>
      formatMonthKey(rows[index]['month']?.toString() ?? '', withYear: withYear);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = [
      for (var i = 0; i < series.length; i++) AppColors.adapt(context, AppColors.tileAccents[_palette[i]]),
    ];
    final peak = rows
        .expand((row) => series.map((item) => analyticsNumber(row, item.key)))
        .fold<num>(0, (maximum, value) => value > maximum ? value : maximum);
    final interval = (peak / 4).ceil().clamp(1, double.infinity).toDouble();
    final maxY = peak == 0 ? 4.0 : (peak / interval).ceil() * interval;
    final selectedMonths = <int>{0, for (var i = 1; i < 4; i++) ((rows.length - 1) * i / 4).round(), rows.length - 1};

    final titles = FlTitlesData(
      topTitles: const AxisTitles(),
      rightTitles: const AxisTitles(),
      leftTitles: AxisTitles(
          sideTitles: SideTitles(
        reservedSize: 34,
        showTitles: true,
        interval: interval,
        getTitlesWidget: (value, _) => Text(
          _axisValue(value),
          textScaler: TextScaler.noScaling,
          style: theme.textTheme.labelSmall?.copyWith(fontSize: 10),
        ),
      )),
      bottomTitles: AxisTitles(
          sideTitles: SideTitles(
        showTitles: true,
        reservedSize: 25,
        interval: 1,
        getTitlesWidget: (value, _) {
          final index = value.round();
          if (index < 0 || index >= rows.length || !selectedMonths.contains(index)) return const SizedBox.shrink();
          return Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(_month(index),
                textScaler: TextScaler.noScaling, style: theme.textTheme.labelSmall?.copyWith(fontSize: 10)),
          );
        },
      )),
    );
    final grid = FlGridData(
      horizontalInterval: interval,
      drawVerticalLine: false,
      getDrawingHorizontalLine: (_) => FlLine(color: theme.colorScheme.outlineVariant, strokeWidth: 1),
    );

    Widget plot(BoxConstraints size) {
      if (bars) {
        final barWidth = ((size.maxWidth - 44) / rows.length / series.length * 0.56).clamp(2, 16).toDouble();
        return BarChart(BarChartData(
          minY: 0,
          maxY: maxY,
          gridData: grid,
          titlesData: titles,
          borderData: FlBorderData(show: false),
          barTouchData: BarTouchData(
              touchTooltipData: BarTouchTooltipData(
            fitInsideHorizontally: true,
            fitInsideVertically: true,
            getTooltipItem: (group, groupIndex, rod, rodIndex) => BarTooltipItem(
              '${_month(group.x, withYear: true)}\n${series[rodIndex].label}: ${analyticsCount(context, rod.toY)}',
              const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
            ),
          )),
          barGroups: [
            for (final (index, row) in rows.indexed)
              BarChartGroupData(x: index, barsSpace: 2, barRods: [
                for (final (seriesIndex, item) in series.indexed)
                  BarChartRodData(
                    toY: analyticsNumber(row, item.key).toDouble(),
                    color: colors[seriesIndex],
                    width: barWidth,
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
                  ),
              ]),
          ],
        ));
      }
      return LineChart(LineChartData(
        minX: 0,
        maxX: rows.length < 2 ? 1 : (rows.length - 1).toDouble(),
        minY: 0,
        maxY: maxY,
        gridData: grid,
        titlesData: titles,
        borderData: FlBorderData(show: false),
        lineTouchData: LineTouchData(
            touchTooltipData: LineTouchTooltipData(
          fitInsideHorizontally: true,
          fitInsideVertically: true,
          getTooltipItems: (spots) => [
            for (final (index, spot) in spots.indexed)
              LineTooltipItem(
                '${index == 0 ? '${_month(spot.x.round(), withYear: true)}\n' : ''}${series[spot.barIndex].label}: ${analyticsCount(context, spot.y)}',
                const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
              ),
          ],
        )),
        lineBarsData: [
          for (final (seriesIndex, item) in series.indexed)
            LineChartBarData(
              spots: [
                for (final (index, row) in rows.indexed)
                  FlSpot(index.toDouble(), analyticsNumber(row, item.key).toDouble())
              ],
              color: colors[seriesIndex],
              barWidth: 2.5,
              isStrokeCapRound: true,
              dotData: FlDotData(show: rows.length < 8),
              belowBarData: BarAreaData(show: series.length == 1, color: colors[seriesIndex].withValues(alpha: 0.12)),
            ),
        ],
      ));
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(title, style: theme.textTheme.titleSmall),
      const SizedBox(height: 8),
      if (peak == 0)
        const Text('No activity in this period.')
      else ...[
        Wrap(spacing: 12, runSpacing: 6, children: [
          for (final (index, item) in series.indexed)
            Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.circle, size: 9, color: colors[index]),
              const SizedBox(width: 5),
              Text(item.label, style: theme.textTheme.bodySmall),
            ]),
        ]),
        const SizedBox(height: 14),
        Semantics(
          label: '$title chart. Expand monthly figures to read exact values.',
          child: ExcludeSemantics(child: SizedBox(height: 190, child: LayoutBuilder(builder: (_, size) => plot(size)))),
        ),
      ],
      if (rows.isNotEmpty)
        ExpansionTile(
          title: const Text('Monthly figures'),
          tilePadding: EdgeInsets.zero,
          children: [
            for (final (index, row) in rows.indexed) ...[
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text(_month(index, withYear: true), style: theme.textTheme.titleSmall),
                  Wrap(spacing: 14, runSpacing: 3, children: [
                    for (final item in series)
                      Text('${item.label}: ${analyticsCount(context, analyticsNumber(row, item.key))}'),
                  ]),
                ]),
              ),
              if (index < rows.length - 1) const Divider(height: 1),
            ],
          ],
        ),
    ]);
  }
}

String _axisValue(double value) {
  if (value < 1000) return value.round().toString();
  final scale = value >= 1000000 ? 1000000 : 1000;
  return (value / scale).toStringAsFixed(value % scale == 0 ? 0 : 1) + (scale == 1000 ? 'k' : 'm');
}
