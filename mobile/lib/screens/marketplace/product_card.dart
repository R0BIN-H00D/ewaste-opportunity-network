import 'package:material_ui/material_ui.dart';
import '../../core/theme/app_colors.dart';
import '../../core/format.dart';
import '../../models/marketplace.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/listing_photo.dart';

BadgeTone productConditionTone(String condition) => (condition == 'like_new' || condition == 'excellent') ? BadgeTone.green : BadgeTone.amber;

/// "Only 1 left", "3 in stock".
String stockText(int stock) => stock == 1 ? 'Only 1 left' : '$stock in stock';

/// A small label that sits on top of a photo, readable on any picture.
class PhotoPill extends StatelessWidget {
  const PhotoPill(this.label, {super.key, this.color, this.dark = false, this.icon});

  final String label;
  final Color? color;
  final bool dark;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fg = dark ? Colors.white : (color ?? theme.colorScheme.primary);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: dark ? Colors.black.withValues(alpha: 0.55) : Colors.white.withValues(alpha: 0.94),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 13, color: fg), const SizedBox(width: 4)],
          Text(label, style: theme.textTheme.labelSmall?.copyWith(color: fg, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

/// One refurbished product in the shop: a large photo with its "Refurbished" grade and stock on it, then title, price and seller.
class ProductCard extends StatelessWidget {
  const ProductCard({super.key, required this.product, required this.onTap});

  final Product product;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final p = product;
    final seller = [p.sellerName, p.sellerCity].where((x) => x != null && x.trim().isNotEmpty).join(', ');
    final priceStyle = theme.textTheme.titleLarge?.copyWith(color: theme.colorScheme.primary, fontWeight: FontWeight.w800);
    final toneColor =productConditionTone(p.condition) == BadgeTone.green ? AppColors.success : AppColors.warning;
    return Semantics(
      button: true,
      label: '${p.title}. ${refurbishedLabel(p.condition)}. ${formatPrice(p.price)}. ${stockText(p.stock)}.${seller.isEmpty ? '' : ' Sold by $seller.'}',
      excludeSemantics: true,
      child: GlassContainer(
        padding: EdgeInsets.zero,
        radius: 26,
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(26),
            onTap: onTap,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Stack(
                  children: [
                    AspectRatio(aspectRatio: 16 / 10, child: ListingPhotoView(photo: p.photos.isEmpty ? null : p.photos.first)),
                    Positioned(left: 12, top: 12, child: PhotoPill(refurbishedLabel(p.condition), color: toneColor, icon: Icons.verified_outlined)),
                    Positioned(right: 12, bottom: 12, child: PhotoPill(p.stock > 0 ? stockText(p.stock) : 'Sold out', dark: true)),
                  ],
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(p.title, style: theme.textTheme.titleMedium, maxLines: 2, overflow: TextOverflow.ellipsis),
                      if (p.subtitle.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(p.subtitle, style: theme.textTheme.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                      ],
                      const SizedBox(height: 10),
                      // Price and seller share a line; when people have made their text large they get a line each.
                      if (MediaQuery.textScalerOf(context).scale(14) / 14 > 1.3) ...[
                        Text(formatPrice(p.price), style: priceStyle),
                        if (seller.isNotEmpty) ...[const SizedBox(height: 6), _Seller(seller: seller)],
                      ] else
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            Text(formatPrice(p.price), style: priceStyle),
                            if (seller.isNotEmpty) ...[
                              const SizedBox(width: 12),
                              Expanded(child: _Seller(seller: seller, end: true)),
                            ],
                          ],
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The seller's name with a small shop icon. Shrinks and ends in "…" rather than overflowing.
class _Seller extends StatelessWidget {
  const _Seller({required this.seller, this.end = false});

  final String seller;
  final bool end;

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.bodySmall;
    return Row(
      mainAxisAlignment: end ? MainAxisAlignment.end : MainAxisAlignment.start,
      children: [
        Icon(Icons.storefront_outlined, size: 15, color: style?.color),
        const SizedBox(width: 4),
        Flexible(child: Text(seller, style: style, maxLines: 1, overflow: TextOverflow.ellipsis)),
      ],
    );
  }
}
