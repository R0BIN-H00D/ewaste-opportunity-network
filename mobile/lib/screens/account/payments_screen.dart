import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../models/account.dart';
import '../../providers/account_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
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
    Widget total(String label, double amount, int count) => Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: theme.textTheme.bodyMedium),
              // A total of nothing is "₹0"; formatPrice would call it "Free", which only suits a single free item.
              Text(amount == 0 ? '₹0' : formatPrice(amount), style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
              Text('$count ${count == 1 ? 'payment' : 'payments'}', style: theme.textTheme.bodyMedium?.copyWith(fontSize: 12)),
            ],
          ),
        );

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Transaction history'),
      body: AppBackground(
        child: SafeArea(
          child: PagedList<PaymentRecord>(
            provider: paymentsProvider,
            header: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (summary != null)
                  GlassContainer(
                    child: Row(children: [total('You paid', summary.paid, summary.paidCount), total('You received', summary.received, summary.receivedCount)]),
                  ),
                const SizedBox(height: 8),
                Text('Payments are made directly between people. The app only keeps a record.', style: theme.textTheme.bodyMedium),
              ],
            ),
            itemBuilder: (context, p) => _PaymentCard(record: p),
            emptyTitle: 'No payments yet',
            emptyMessage: 'When you complete a repair or an order, its payment record appears here.',
            emptyIcon: Icons.receipt_long_outlined,
            skeletonHeight: 84,
          ),
        ),
      ),
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
    final card = GlassContainer(
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(record.title.isEmpty ? 'Payment' : record.title, style: theme.textTheme.titleMedium),
                if (who.isNotEmpty) Text(who, style: theme.textTheme.bodyMedium),
                const SizedBox(height: 4),
                Row(
                  children: [
                    StatusBadge(
                      _statusLabels[record.status] ?? record.status,
                      tone: record.status == 'confirmed' ? BadgeTone.green : (record.status == 'disputed' ? BadgeTone.red : BadgeTone.neutral),
                    ),
                    const SizedBox(width: 8),
                    Flexible(child: Text(formatDate(record.createdAt), style: theme.textTheme.bodyMedium?.copyWith(fontSize: 12))),
                  ],
                ),
              ],
            ),
          ),
          Text(amount, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700, color: record.received ? theme.colorScheme.primary : null)),
        ],
      ),
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: record.requestId == null
          ? card
          : InkWell(borderRadius: BorderRadius.circular(20), onTap: () => context.push(Routes.request(record.requestId!)), child: card),
    );
  }
}
