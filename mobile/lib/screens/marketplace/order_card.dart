import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/theme/app_colors.dart';
import '../../models/marketplace.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/listing_photo.dart';

/// Amber when the viewer has to act, green when done, red when cancelled, blue otherwise.
BadgeTone orderTone(Order o) {
  switch (o.status) {
    case 'completed':
      return BadgeTone.green;
    case 'cancelled':
      return BadgeTone.red;
    case 'placed':
      return o.isSellerView ? BadgeTone.amber : BadgeTone.blue;
    case 'delivered':
      return o.isSellerView ? BadgeTone.blue : BadgeTone.amber;
    default:
      return BadgeTone.blue;
  }
}

/// The colour of a tone, the same one the status badge uses.
Color orderToneColor(BuildContext context, BadgeTone tone) => AppColors.adapt(context, _orderBase(context, tone));

Color _orderBase(BuildContext context, BadgeTone tone) {
  switch (tone) {
    case BadgeTone.green:
      return AppColors.success;
    case BadgeTone.amber:
      return AppColors.warning;
    case BadgeTone.red:
      return AppColors.danger;
    case BadgeTone.blue:
      return AppColors.info;
    case BadgeTone.neutral:
      return Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6);
  }
}

/// How far an order has come, from 0 (placed) to 4 (completed). A cancelled order is -1.
int orderStage(String status) {
  switch (status) {
    case 'placed':
      return 0;
    case 'confirmed':
      return 1;
    case 'ready':
      return 2;
    case 'delivered':
      return 3;
    case 'completed':
      return 4;
    default:
      return -1;
  }
}

/// Five thin segments that fill as the order moves on. Decoration only: the status badge says the same in words.
class OrderProgressBar extends StatelessWidget {
  const OrderProgressBar({super.key, required this.status, required this.color});

  final String status;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final stage = orderStage(status);
    final idle = Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.10);
    return ExcludeSemantics(
      child: Row(
        children: [
          for (var i = 0; i < 5; i++) ...[
            if (i > 0) const SizedBox(width: 4),
            Expanded(
              child: Container(
                height: 4,
                decoration: BoxDecoration(
                  color: stage < 0 ? color.withValues(alpha: 0.35) : (i <= stage ? color : idle),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// One order in the list: the product, who it is with, the quantity and total, and where it stands.
class OrderCard extends StatelessWidget {
  const OrderCard({super.key, required this.order, required this.onTap});

  final Order order;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final o = order;
    final who = o.isSellerView ? (o.buyerName ?? 'Buyer') : (o.sellerName ?? 'Seller');
    final status = orderStatusLabel(o.status, seller: o.isSellerView);
    final what = '${o.quantity} × ${formatPrice(o.priceAtOrder)} = ${formatPrice(o.total)}';
    final tone = orderTone(o);
    final color = orderToneColor(context, tone);
    return Semantics(
      button: true,
      label: '${o.productTitle ?? 'Order'}. $who. $what. $status.',
      excludeSemantics: true,
      child: GlassContainer(
        padding: EdgeInsets.zero,
        radius: 22,
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(22),
            onTap: onTap,
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // The edge takes the colour of the status, so a list of orders can be read at a glance.
                  ExcludeSemantics(child: Container(width: 5, color: color)),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(12, 12, 8, 14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              ClipRRect(borderRadius: BorderRadius.circular(14), child: SizedBox(width: 64, height: 64, child: ListingPhotoView(photo: o.photo))),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(o.productTitle ?? 'Order', style: theme.textTheme.titleSmall?.copyWith(fontSize: 15), maxLines: 1, overflow: TextOverflow.ellipsis),
                                    const SizedBox(height: 2),
                                    Row(
                                      children: [
                                        Icon(o.isSellerView ? Icons.person_outline : Icons.storefront_outlined, size: 14, color: theme.textTheme.bodySmall?.color),
                                        const SizedBox(width: 4),
                                        Expanded(child: Text(who, style: theme.textTheme.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis)),
                                      ],
                                    ),
                                    const SizedBox(height: 6),
                                    Text(what, style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.primary, fontSize: 14)),
                                  ],
                                ),
                              ),
                              Icon(Icons.chevron_right_rounded, color: theme.colorScheme.onSurface.withValues(alpha: 0.4)),
                            ],
                          ),
                          const SizedBox(height: 12),
                          Padding(padding: const EdgeInsets.only(right: 4), child: OrderProgressBar(status: o.status, color: color)),
                          const SizedBox(height: 10),
                          Padding(
                            padding: const EdgeInsets.only(right: 4),
                            child: Row(
                              children: [
                                StatusBadge(status, tone: tone),
                                const Spacer(),
                                if (o.updatedAt != null) Text('Updated ${formatDate(o.updatedAt)}', style: theme.textTheme.bodySmall),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
