import 'package:cached_network_image/cached_network_image.dart';
import 'package:material_ui/material_ui.dart';
import '../core/format.dart';
import '../models/listing.dart';

/// A listing's photo, or a calm placeholder when there is none (or it cannot be loaded).
class ListingPhotoView extends StatelessWidget {
  const ListingPhotoView({super.key, required this.photo, this.fit = BoxFit.cover, this.semanticLabel});

  final ListingPhoto? photo;
  final BoxFit fit;
  final String? semanticLabel;

  Widget _placeholder(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      color: scheme.onSurface.withValues(alpha: 0.06),
      alignment: Alignment.center,
      child: Icon(Icons.image_not_supported_outlined, size: 36, color: scheme.onSurface.withValues(alpha: 0.4)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final url = assetUrl(photo?.url);
    if (url.isEmpty) return Semantics(label: 'No photo', child: _placeholder(context));
    return Semantics(
      image: true,
      label: semanticLabel ?? 'Device photo',
      child: ExcludeSemantics(
        child: CachedNetworkImage(
          imageUrl: url,
          fit: fit,
          fadeInDuration: const Duration(milliseconds: 150),
          placeholder: (context, _) => Container(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.06)),
          errorWidget: (context, _, __) => _placeholder(context),
        ),
      ),
    );
  }
}
