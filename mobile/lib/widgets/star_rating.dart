import 'package:material_ui/material_ui.dart';

/// One to five stars. With [onChanged] it is an input (each star a 48 dp target a screen reader names "3 stars");
/// without it, a read-only display of [value].
class StarRating extends StatelessWidget {
  const StarRating({super.key, required this.value, this.onChanged, this.size = 32, this.label});

  final int value;
  final ValueChanged<int>? onChanged;
  final double size;

  /// What is being rated, read out with each star ("Quality of work, 3 stars").
  final String? label;

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.primary;
    final idle = Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.35);
    Widget star(int n) {
      final on = n <= value;
      final icon = Icon(on ? Icons.star_rounded : Icons.star_outline_rounded, size: size, color: on ? color : idle);
      if (onChanged == null) return icon;
      return Semantics(
        button: true,
        selected: n == value,
        label: '${label == null ? '' : '$label, '}$n ${n == 1 ? 'star' : 'stars'}',
        excludeSemantics: true,
        child: InkResponse(
          radius: 24,
          onTap: () => onChanged!(n),
          child: SizedBox(width: 48, height: 48, child: Center(child: icon)),
        ),
      );
    }

    final row = Row(mainAxisSize: MainAxisSize.min, children: [for (var n = 1; n <= 5; n++) star(n)]);
    if (onChanged != null) return row;
    return Semantics(label: '${label == null ? '' : '$label: '}$value out of 5 stars', excludeSemantics: true, child: row);
  }
}
