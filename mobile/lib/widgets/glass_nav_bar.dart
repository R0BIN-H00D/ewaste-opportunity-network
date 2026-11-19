import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'glass_container.dart';

class NavItem {
  const NavItem(
      {required this.icon, required this.selectedIcon, required this.label});

  final IconData icon;
  final IconData selectedIcon;
  final String label;
}

/// The floating glass bottom bar: small and centred, not a bar across the whole screen. The selected tab sits in a soft pill;
/// every item shows its name, is at least 48 dp high and says "selected" to screen readers.
class GlassNavBar extends StatelessWidget {
  const GlassNavBar(
      {super.key,
      required this.items,
      required this.currentIndex,
      required this.onSelected});

  final List<NavItem> items;
  final int currentIndex;
  final ValueChanged<int> onSelected;

  /// Width cap for the compact bar. Four tabs get extra room for their labels.
  static const double maxWidth = 280;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    // heightFactor 1 keeps the bar as tall as its content; a bare Center would stretch it over the screen.
    return Center(heightFactor: 1, child: _bar(context, scheme));
  }

  Widget _bar(BuildContext context, ColorScheme scheme) {
    final theme = Theme.of(context);
    return SafeArea(
      minimum: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: items.length >= 4 ? 360 : maxWidth),
        child: GlassContainer(
          radius: 26,
          color: Colors.transparent,
          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 5),
          child: Row(
            children: [
              for (var i = 0; i < items.length; i++)
                Expanded(
                  child: Semantics(
                    button: true,
                    selected: i == currentIndex,
                    label: items[i].label,
                    excludeSemantics: true,
                    child: Material(
                      type: MaterialType.transparency,
                      child: InkWell(
                        borderRadius: BorderRadius.circular(20),
                        onTap: () {
                          if (i != currentIndex) {
                            HapticFeedback.selectionClick();
                          }
                          onSelected(i);
                        },
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(minHeight: 48),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 220),
                            curve: Curves.easeOutCubic,
                            padding: const EdgeInsets.symmetric(vertical: 5),
                            decoration: BoxDecoration(
                              color: i == currentIndex
                                  ? scheme.primary.withValues(alpha: 0.12)
                                  : Colors.transparent,
                              borderRadius: BorderRadius.circular(20),
                            ),
                            // min: a Column left at its default would take all the height the Scaffold offers and stretch the bar over the screen.
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  i == currentIndex
                                      ? items[i].selectedIcon
                                      : items[i].icon,
                                  size: 22,
                                  color: i == currentIndex
                                      ? scheme.primary
                                      : scheme.onSurface.withValues(alpha: 0.6),
                                ),
                                const SizedBox(height: 1),
                                Text(
                                  items[i].label,
                                  textAlign: TextAlign.center,
                                  style: theme.textTheme.labelSmall?.copyWith(
                                    fontSize: 11,
                                    color: i == currentIndex
                                        ? scheme.primary
                                        : scheme.onSurface
                                            .withValues(alpha: 0.6),
                                    fontWeight: i == currentIndex
                                        ? FontWeight.w800
                                        : FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
