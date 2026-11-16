import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../models/marketplace.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/listing_photo.dart';

BadgeTone productConditionTone(String condition) => (condition == 'like_new' || condition == 'excellent') ? BadgeTone.green : BadgeTone.amber;

/// "Only 1 left", "3 in stock".
String stockText(int stock) => stock == 1 ? 'Only 1 left' : '$stock in stock';

/// One refurbished product in the shop: photo, title, the "Refurbished" label with its grade, price and seller.
class ProductCard extends StatelessWidget {
  const ProductCard({super.key, required this.product, required this.onTap});

  final Product product;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final p = product;
    final seller = [p.sellerName, p.sellerCity].where((x) => x != null && x.trim().isNotEmpty).join(', ');
    return Semantics(
      button: true,
      label: '${p.title}. ${refurbishedLabel(p.condition)}. ${formatPrice(p.price)}. ${stockText(p.stock)}.${seller.isEmpty ? '' : ' Sold by $seller.'}',
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
                  ClipRRect(borderRadius: BorderRadius.circular(16), child: SizedBox(width: 96, height: 96, child: ListingPhotoView(photo: p.photos.isEmpty ? null : p.photos.first))),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(p.title, style: theme.textTheme.titleLarge?.copyWith(fontSize: 16), maxLines: 2, overflow: TextOverflow.ellipsis),
                        if (p.subtitle.isNotEmpty) Text(p.subtitle, style: theme.textTheme.bodyMedium?.copyWith(fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 6),
                        StatusBadge(refurbishedLabel(p.condition), tone: productConditionTone(p.condition)),
                        const SizedBox(height: 6),
                        Text(formatPrice(p.price), style: theme.textTheme.titleLarge?.copyWith(fontSize: 18, color: theme.colorScheme.primary)),
                        if (seller.isNotEmpty) Text(seller, style: theme.textTheme.bodyMedium?.copyWith(fontSize: 12), maxLines: 1, overflow: TextOverflow.ellipsis),
                      ],
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
