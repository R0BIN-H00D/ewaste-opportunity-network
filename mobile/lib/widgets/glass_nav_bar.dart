import 'package:material_ui/material_ui.dart';
import 'glass_container.dart';

class NavItem {
  const NavItem({required this.icon, required this.selectedIcon, required this.label});

  final IconData icon;
  final IconData selectedIcon;
  final String label;
}

/// The floating glass bottom bar. Every item is at least 48 dp high and says "selected" to screen readers.
class GlassNavBar extends StatelessWidget {
  const GlassNavBar({super.key, required this.items, required this.currentIndex, required this.onSelected});

  final List<NavItem> items;
  final int currentIndex;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    // heightFactor 1 keeps the bar as tall as its content; a bare Center would stretch it over the screen.
    return Center(
      heightFactor: 1,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560),
        child: _bar(context, scheme),
      ),
    );
  }

  Widget _bar(BuildContext context, ColorScheme scheme) {
    return SafeArea(
      minimum: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: GlassContainer(
        radius: 28,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Row(
          children: [
            for (var i = 0; i < items.length; i++)
              Expanded(
                child: Semantics(
                  button: true,
                  selected: i == currentIndex,
                  label: items[i].label,
                  excludeSemantics: true,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(20),
                    onTap: () => onSelected(i),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(minHeight: 52),
                      // min: a Column left at its default would take all the height the Scaffold offers and stretch the bar over the screen.
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(i == currentIndex ? items[i].selectedIcon : items[i].icon, color: i == currentIndex ? scheme.primary : scheme.onSurface.withValues(alpha: 0.65)),
                          const SizedBox(height: 2),
                          Text(
                            items[i].label,
                            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                                  color: i == currentIndex ? scheme.primary : null,
                                  fontWeight: i == currentIndex ? FontWeight.w700 : FontWeight.w600,
                                ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
