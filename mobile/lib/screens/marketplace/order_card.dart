import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
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
    return Semantics(
      button: true,
      label: '${o.productTitle ?? 'Order'}. $who. $what. $status.',
      excludeSemantics: true,
      child: GlassContainer(
        padding: EdgeInsets.zero,
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(24),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ClipRRect(borderRadius: BorderRadius.circular(16), child: SizedBox(width: 72, height: 72, child: ListingPhotoView(photo: o.photo))),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(o.productTitle ?? 'Order', style: theme.textTheme.titleLarge?.copyWith(fontSize: 16), maxLines: 1, overflow: TextOverflow.ellipsis),
                        Text(who, style: theme.textTheme.bodyMedium?.copyWith(fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis),
                        Text(what, style: theme.textTheme.bodyMedium?.copyWith(fontSize: 13)),
                        const SizedBox(height: 6),
                        StatusBadge(status, tone: orderTone(o)),
                        if (o.updatedAt != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text('Updated ${formatDate(o.updatedAt)}', style: theme.textTheme.bodyMedium?.copyWith(fontSize: 12))),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
