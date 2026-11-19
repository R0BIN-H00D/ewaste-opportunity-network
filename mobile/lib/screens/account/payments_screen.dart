import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/theme/app_colors.dart';
import '../../models/account.dart';
import '../../providers/account_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/paged_list.dart';

const _statusLabels = {'recorded': 'Recorded', 'confirmed': 'Confirmed', 'disputed': 'Disputed'};

/// What the person paid and was paid. The app never handles money; these are records of direct payments (BR-10).
class PaymentsPage extends ConsumerWidget {
  const PaymentsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final summary = ref.watch(paymentSummaryProvider).valueOrNull;
    Widget total(IconData icon, String label, double amount, int count) => Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  ExcludeSemantics(
                    child: Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.18), shape: BoxShape.circle),
                      child: Icon(icon, size: 16, color: Colors.white),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Flexible(child: Text(label, style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white.withValues(alpha: 0.85)))),
                ],
              ),
              const SizedBox(height: 10),
              // A total of nothing is "₹0"; formatPrice would call it "Free", which only suits a single free item.
              Text(amount == 0 ? '₹0' : formatPrice(amount), style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800, color: Colors.white)),
              Text('$count ${count == 1 ? 'payment' : 'payments'}', style: theme.textTheme.bodySmall?.copyWith(color: Colors.white.withValues(alpha: 0.75))),
            ],
          ),
        );

    return PagedList<PaymentRecord>(
      provider: paymentsProvider,
      header: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(header: true, child: Text('Transaction history', style: theme.textTheme.headlineSmall)),
          const SizedBox(height: 16),
          if (summary != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(24),
              child: DecoratedBox(
                decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: AppColors.heroGradient)),
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      total(Icons.north_east_rounded, 'You paid', summary.paid, summary.paidCount),
                      Container(width: 1, height: 70, margin: const EdgeInsets.symmetric(horizontal: 14), color: Colors.white.withValues(alpha: 0.25)),
                      total(Icons.south_west_rounded, 'You received', summary.received, summary.receivedCount),
                    ],
                  ),
                ),
              ),
            ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.info_outline_rounded, size: 16, color: theme.textTheme.bodySmall?.color),
              const SizedBox(width: 8),
              Expanded(child: Text('Payments are made directly between people. The app only keeps a record.', style: theme.textTheme.bodySmall)),
            ],
          ),
        ],
      ),
      itemBuilder: (context, p) => _PaymentCard(record: p),
      emptyTitle: 'No payments yet',
      emptyMessage: 'When you complete a repair or an order, its payment record appears here.',
      emptyIcon: Icons.receipt_long_outlined,
      skeletonHeight: 84,
    );
  }
}

class _PaymentCard extends StatelessWidget {
  const _PaymentCard({required this.record});

  final PaymentRecord record;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final who = record.counterparty == null ? '' : (record.received ? 'From ${record.counterparty}' : 'To ${record.counterparty}');
    // A free donation has no amount to add or take away, so it shows plain "Free" without a sign.
    final amount = record.amount == 0 ? formatPrice(0) : '${record.received ? '+' : '−'}${formatPrice(record.amount)}';
    final direction = AppColors.adapt(context, record.received ? AppColors.success : AppColors.warning);
    final card = GlassContainer(
      radius: 20,
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          ExcludeSemantics(
            child: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(color: direction.withValues(alpha: 0.13), borderRadius: BorderRadius.circular(14)),
              child: Icon(record.received ? Icons.south_west_rounded : Icons.north_east_rounded, size: 22, color: direction),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(record.title.isEmpty ? 'Payment' : record.title, style: theme.textTheme.titleSmall?.copyWith(fontSize: 15), maxLines: 2, overflow: TextOverflow.ellipsis),
                if (who.isNotEmpty) Text(who, style: theme.textTheme.bodySmall),
                const SizedBox(height: 6),
                Wrap(
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    StatusBadge(
                      _statusLabels[record.status] ?? record.status,
                      tone: record.status == 'confirmed' ? BadgeTone.green : (record.status == 'disputed' ? BadgeTone.red : BadgeTone.neutral),
                    ),
                    Text(formatDate(record.createdAt), style: theme.textTheme.bodySmall),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(amount, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800, color: record.received ? theme.colorScheme.primary : null)),
        ],
      ),
    );
    return record.requestId == null
        ? card
        : InkWell(borderRadius: BorderRadius.circular(20), onTap: () => context.push(Routes.request(record.requestId!)), child: card);
  }
}
