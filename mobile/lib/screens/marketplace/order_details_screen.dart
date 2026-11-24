import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../models/marketplace.dart';
import '../../providers/marketplace_providers.dart';
import '../../routes/route_paths.dart';
import '../../services/marketplace_repository.dart';
import '../../services/razorpay_checkout.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/message_button.dart';
import '../../widgets/listing_photo.dart';
import '../../widgets/message_banner.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';
import '../requests/request_dialogs.dart';
import 'order_card.dart';

/// One plain sentence on where the order stands and what happens next, for whoever is looking.
String orderHint(Order o) {
  final seller = o.sellerName ?? 'The seller';
  if (o.isSellerView) {
    switch (o.status) {
      case 'placed':
        return 'Confirm the order to reserve the stock, or cancel it. Stock is only taken when you confirm.';
      case 'confirmed':
        return 'Get the device ready, then mark it ready.';
      case 'ready':
        return 'Hand the device to the buyer and mark it handed over. You are paid directly by the buyer.';
      case 'delivered':
        return 'Waiting for the buyer to confirm they received it.';
      case 'completed':
        return 'Finished. The sale is recorded and counts towards your reuse impact.';
      default:
        return 'This order was cancelled.';
    }
  }
  switch (o.status) {
    case 'placed':
      return 'Waiting for $seller to confirm. You can cancel until the order is ready.';
    case 'confirmed':
      return '$seller confirmed your order and is getting it ready.';
    case 'ready':
      return 'Your order is ready. $seller will arrange the handover with you.';
    case 'delivered':
      return 'Handed over. Please confirm that you received it.';
    case 'completed':
      return o.reviewed
          ? 'Done. Thank you for your review.'
          : 'Done. You can review the seller below.';
    default:
      return 'This order was cancelled.';
  }
}

class OrderDetailsScreen extends ConsumerWidget {
  const OrderDetailsScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final order = ref.watch(orderProvider(id));
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Order'),
      body: AppBackground(
        child: SafeArea(
          child: order.when(
            skipLoadingOnReload: true,
            loading: () =>
                ListView(padding: const EdgeInsets.all(20), children: const [
              Skeleton(height: 110, radius: 24),
              SizedBox(height: 16),
              Skeleton(height: 160, radius: 24)
            ]),
            error: (e, _) => ListView(
              padding: const EdgeInsets.all(20),
              children: [
                ErrorState(
                  error: ApiException.from(e),
                  title: ApiException.from(e).failure == ApiFailure.notFound
                      ? 'This order is not available'
                      : null,
                  onRetry: () => ref.invalidate(orderProvider(id)),
                ),
              ],
            ),
            data: (o) => RefreshIndicator(
                onRefresh: () => ref.read(orderProvider(id).notifier).refresh(),
                child: _Body(order: o)),
          ),
        ),
      ),
    );
  }
}

class _Body extends ConsumerStatefulWidget {
  const _Body({required this.order});

  final Order order;

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  bool _busy = false;
  String? _error;

  Order get o => widget.order;

  /// Runs one action with a disabled button, shows what the server said if it refuses, and refreshes what the action may have changed.
  Future<void> _act(Future<Order> Function(MarketplaceRepository repo) action,
      {String? done}) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(orderProvider(o.id).notifier).run((repo) => action(repo));
      ref.invalidate(
          productsProvider); // stock changes when an order is confirmed or cancelled
      ref.invalidate(productProvider(o.productId));
      if (done != null && mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(done)));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.fieldErrors.values.isNotEmpty
          ? e.fieldErrors.values.first
          : e.message);
      // The other side changed it first: show what it looks like now.
      if (e.code == 'STALE_STATE' || e.failure == ApiFailure.conflict)
        await ref.read(orderProvider(o.id).notifier).refresh();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Online demo payment: start on the server, open the payment window, then let the server check the result.
  Future<void> _pay() async {
    final launcher = ref.read(paymentLauncherProvider);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(orderProvider(o.id).notifier).run((repo) async {
        final session = await repo.startPayment(o.id);
        try {
          final proof = await launcher.pay(session);
          return await repo.verifyPayment(o.id, proof);
        } on PaymentCancelled {
          return o; // closed the window: nothing changes
        }
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Payment received')));
      }
    } on PaymentFailed catch (e) {
      if (mounted) setState(() => _error = e.message);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.fieldErrors.values.isNotEmpty ? e.fieldErrors.values.first : e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirm() =>
      _act((repo) => repo.confirm(o.id), done: 'Order confirmed');
  Future<void> _ready() =>
      _act((repo) => repo.markReady(o.id), done: 'Marked ready');

  Future<void> _delivered() async {
    final ok = await askConfirm(context,
        title: 'Handed it over?',
        message:
            'Confirm that you have handed the device to ${o.buyerName ?? 'the buyer'}. They will be asked to confirm they received it.',
        confirmLabel: 'Yes, handed over');
    if (!ok) return;
    await _act((repo) => repo.markDelivered(o.id), done: 'Marked handed over');
  }

  Future<void> _received() async {
    final ok = await askConfirm(
      context,
      title: 'Did you receive it?',
      message:
          'This completes the order. You pay ${o.sellerName ?? 'the seller'} directly. The app never handles money.',
      confirmLabel: 'Yes, I received it',
    );
    if (!ok) return;
    await _act((repo) => repo.complete(o.id), done: 'Order completed');
  }

  Future<void> _cancel() async {
    final answer = await askReason(
      context,
      title: 'Cancel this order?',
      confirmLabel: 'Cancel order',
      message: o.isSellerView
          ? 'The buyer is told and can order again.'
          : 'The seller is told. If it was confirmed, the stock goes back on sale.',
    );
    if (answer == null) return;
    await _act((repo) => repo.cancel(o.id, reason: answer.reason),
        done: 'Order cancelled');
  }

  Future<void> _review() async {
    final input = await askReview(context,
        technicianName: o.sellerName, subject: 'seller');
    if (input == null) return;
    await _act((repo) => repo.review(o.id, input),
        done: 'Thank you for your review');
  }

  Widget _fact(ThemeData theme, String label, String value, {bool strong = false}) => Column(
        children: [
          Divider(height: 1, color: theme.colorScheme.outlineVariant),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 11),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(width: 110, child: Text(label, style: theme.textTheme.bodyMedium)),
                Expanded(
                  child: Text(
                    value,
                    style: strong
                        ? theme.textTheme.titleMedium?.copyWith(color: theme.colorScheme.primary, fontWeight: FontWeight.w800)
                        : theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
          ),
        ],
      );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    Widget button(String label, IconData icon, VoidCallback onTap,
            {bool primary = false}) =>
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: primary
              ? FilledButton.icon(
                  onPressed: _busy ? null : onTap,
                  icon: Icon(icon),
                  label: Text(label),
                  style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(48)))
              : OutlinedButton.icon(
                  onPressed: _busy ? null : onTap,
                  icon: Icon(icon),
                  label: Text(label),
                  style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(48))),
        );

    final buttons = <Widget>[
      if (o.can('pay'))
        button('Pay ${formatPrice(o.total)}', Icons.payment_rounded, _pay, primary: true),
      if (o.can('confirm'))
        button('Confirm order', Icons.check_circle_outline, _confirm,
            primary: true),
      if (o.can('mark_ready'))
        button('Mark ready', Icons.inventory_2_outlined, _ready, primary: true),
      if (o.can('mark_delivered'))
        button('Mark handed over', Icons.handshake_outlined, _delivered,
            primary: true),
      if (o.can('complete') && !o.isSellerView)
        button('I received it', Icons.task_alt_outlined, _received,
            primary: true),
      if (o.canReview)
        button('Review the seller', Icons.star_outline_rounded, _review,
            primary: true),
      if (o.can('cancel'))
        button('Cancel order', Icons.cancel_outlined, _cancel),
    ];
    final who =
        o.isSellerView ? (o.buyerName ?? 'Buyer') : (o.sellerName ?? 'Seller');
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
      children: [
        GlassContainer(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: SizedBox(
                          width: 72,
                          height: 72,
                          child: ListingPhotoView(photo: o.photo))),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Semantics(
                            header: true,
                            child: Text(o.productTitle ?? 'Order',
                                style: theme.textTheme.titleLarge)),
                        if (o.productCondition != null)
                          Text(refurbishedLabel(o.productCondition!),
                              style: theme.textTheme.bodyMedium),
                        const SizedBox(height: 6),
                        StatusBadge(
                            orderStatusLabel(o.status, seller: o.isSellerView),
                            tone: orderTone(o)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              _Stepper(status: o.status, color: orderToneColor(context, orderTone(o))),
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: orderToneColor(context, orderTone(o)).withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ExcludeSemantics(child: Icon(Icons.info_outline_rounded, size: 20, color: orderToneColor(context, orderTone(o)))),
                    const SizedBox(width: 10),
                    Expanded(child: Text(orderHint(o), style: theme.textTheme.bodyLarge?.copyWith(fontSize: 14.5))),
                  ],
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                MessageBanner(message: _error!, tone: BannerTone.error)
              ],
              if (o.status == 'cancelled' &&
                  (o.cancelReason ?? '').trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                MessageBanner(
                    message: 'Reason: ${o.cancelReason!.trim()}',
                    tone: BannerTone.warning),
              ],
              ...buttons,
              Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: MessageButton(
                      contextType: 'order',
                      contextId: o.id,
                      label: 'Message $who')),
              if (o.productId.isNotEmpty && !o.isSellerView)
                Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: TextButton(
                        onPressed: () =>
                            context.push(Routes.product(o.productId)),
                        child: const Text('View the product'))),
            ],
          ),
        ),
        const SizedBox(height: 16),
        GlassContainer(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  children: [
                    Icon(Icons.receipt_long_outlined, size: 20, color: theme.colorScheme.primary),
                    const SizedBox(width: 8),
                    Expanded(child: Semantics(header: true, child: Text('The order', style: theme.textTheme.titleMedium))),
                  ],
                ),
              ),
              _fact(theme, o.isSellerView ? 'Buyer' : 'Seller', who),
              _fact(theme, 'Quantity', '${o.quantity}'),
              _fact(theme, 'Price each', formatPrice(o.priceAtOrder)),
              _fact(theme, 'Total', formatPrice(o.total), strong: true),
              _fact(theme, 'Payment', labelOf(paymentMethods, o.paymentMethod)),
              if (o.paymentStatus == 'paid_offline')
                _fact(theme, 'Paid', 'Paid directly to the seller'),
              if (o.paymentStatus == 'paid_online')
                _fact(theme, 'Paid', 'Paid online'),
              if (o.paymentStatus == 'refunded')
                _fact(theme, 'Paid', 'Refunded'),
              if (o.paymentStatus == 'refund_pending')
                _fact(theme, 'Paid', 'Refund pending'),
              if ((o.deliveryArea ?? '').trim().isNotEmpty)
                _fact(
                    theme,
                    'Deliver to',
                    [o.deliveryArea, o.deliveryCity, o.deliveryPincode]
                        .where((v) => (v ?? '').trim().isNotEmpty)
                        .map((v) => v!.trim())
                        .join(', ')),
              if ((o.notes ?? '').trim().isNotEmpty)
                _fact(theme, 'Note', o.notes!.trim()),
              const SizedBox(height: 8),
              Text(
                  'Exact addresses are shared between you and the other side, not shown here.',
                  style: theme.textTheme.bodyMedium),
            ],
          ),
        ),
        if (o.history.isNotEmpty) ...[
          const SizedBox(height: 16),
          _Timeline(steps: o.history, seller: o.isSellerView)
        ],
      ],
    );
  }
}

/// The five steps of an order as icons joined by a line; the steps reached are filled. The status badge and the
/// sentence under it say the same in words, so this is decoration for screen readers.
class _Stepper extends StatelessWidget {
  const _Stepper({required this.status, required this.color});

  final String status;
  final Color color;

  static const _icons = [Icons.receipt_long_outlined, Icons.check_circle_outline, Icons.inventory_2_outlined, Icons.handshake_outlined, Icons.task_alt_outlined];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final stage = orderStage(status);
    final idle = theme.colorScheme.onSurface.withValues(alpha: 0.10);
    final cancelled = stage < 0;
    return ExcludeSemantics(
      child: Row(
        children: [
          for (var i = 0; i < 5; i++) ...[
            if (i > 0)
              Expanded(child: Container(height: 3, decoration: BoxDecoration(color: !cancelled && i <= stage ? color : idle, borderRadius: BorderRadius.circular(2)))),
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: cancelled ? idle : (i <= stage ? color : idle),
                boxShadow: !cancelled && i == stage ? [BoxShadow(color: color.withValues(alpha: 0.35), blurRadius: 10, offset: const Offset(0, 3))] : null,
              ),
              child: Icon(cancelled ? Icons.close_rounded : _icons[i], size: 19, color: !cancelled && i <= stage ? Colors.white : theme.colorScheme.onSurface.withValues(alpha: 0.4)),
            ),
          ],
        ],
      ),
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.steps, required this.seller});

  final List<OrderStep> steps;
  final bool seller;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final latestFirst = steps.reversed.toList();
    return GlassContainer(
      radius: 24,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              children: [
                Icon(Icons.history_rounded, size: 20, color: theme.colorScheme.primary),
                const SizedBox(width: 8),
                Expanded(child: Semantics(header: true, child: Text('History', style: theme.textTheme.titleMedium))),
              ],
            ),
          ),
          for (var i = 0; i < latestFirst.length; i++)
            Semantics(
              label: [
                '${orderStatusLabel(latestFirst[i].status, seller: seller)}. ${formatDateTime(latestFirst[i].at)}.',
                if ((latestFirst[i].note ?? '').trim().isNotEmpty) '${latestFirst[i].note!.trim()}.',
              ].join(' '),
              excludeSemantics: true,
              child: IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // A dot for the step and a line down to the next one.
                    SizedBox(
                      width: 22,
                      child: Column(
                        children: [
                          const SizedBox(height: 4),
                          Container(
                            width: i == 0 ? 14 : 10,
                            height: i == 0 ? 14 : 10,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: i == 0 ? theme.colorScheme.primary : theme.colorScheme.onSurface.withValues(alpha: 0.25),
                              boxShadow: i == 0 ? [BoxShadow(color: theme.colorScheme.primary.withValues(alpha: 0.3), blurRadius: 8)] : null,
                            ),
                          ),
                          if (i < latestFirst.length - 1) Expanded(child: Container(width: 2, margin: const EdgeInsets.symmetric(vertical: 4), color: theme.colorScheme.outlineVariant)),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(orderStatusLabel(latestFirst[i].status, seller: seller), style: theme.textTheme.bodyLarge?.copyWith(fontWeight: i == 0 ? FontWeight.w800 : FontWeight.w600)),
                            Text(formatDateTime(latestFirst[i].at), style: theme.textTheme.bodySmall),
                            if ((latestFirst[i].note ?? '').trim().isNotEmpty) Padding(padding: const EdgeInsets.only(top: 2), child: Text(latestFirst[i].note!.trim(), style: theme.textTheme.bodyMedium)),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
