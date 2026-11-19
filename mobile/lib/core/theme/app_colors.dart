import 'package:material_ui/material_ui.dart';

/// The app's palette: deep forest green with mint, emerald and a lime highlight, and a few supporting colours for icons.
/// Do not add ad-hoc colours in widgets.
///
/// Contrast (WCAG 2.1): white on [primary] 9.1:1, white on every [heroGradient] stop 5.6 or better, [textLight] on [bgLight]
/// 13.7, [textMutedLight] on white 5.9, [primaryTint] on [bgDark] 9.5, [textMutedDark] on [bgDark] 8.2. The status colours
/// below are for light surfaces; [adapt] swaps in the brighter dark-theme version so they stay readable on dark cards.
class AppColors {
  // Brand.
  static const primary = Color(0xFF14532D);
  static const primaryHover = Color(0xFF166534);
  static const primaryTint = Color(0xFF34D399); // the brand colour on dark surfaces
  static const secondary = Color(0xFF10B981);
  static const secondaryStrong = Color(0xFF047857); // meaningful icons and borders on a light background (4.5:1)
  static const accent = Color(0xFFA3E635); // lime highlight: badges and small marks on the dark header
  static const onAccent = Color(0xFF14532D); // text on [accent] (6.0:1)

  // Surfaces.
  static const bgLight = Color(0xFFF5F8F5);
  static const bgDark = Color(0xFF0B1712);
  static const surfaceLight = Color(0xFFFFFFFF);
  static const surfaceDark = Color(0xFF12241C);

  // Text.
  static const textLight = Color(0xFF1F2937);
  static const textMutedLight = Color(0xFF4B5666);
  static const textDark = Color(0xFFE8F1EB);
  static const textMutedDark = Color(0xFF9FB2A7);

  // Page backgrounds behind the cards (top to bottom): a mint, the page colour, and a breath of lime.
  static const gradientLight = [Color(0xFFC8EBD6), Color(0xFFE2F3E8), Color(0xFFDCEFC4)];
  static const gradientDark = [bgDark, Color(0xFF10261C), bgDark];

  // The big soft colour shapes behind every screen, for the glass to blur and tint. All greens, so the glass matches the page.
  // x and y are where the middle of the shape is (0 to 1 across and down the screen), size is its width as a fraction of the
  // screen width.
  static const orbsLight = <({double x, double y, double size, Color color})>[
    (x: 0.96, y: 0.05, size: 1.10, color: Color(0x9934D399)), // emerald
    (x: 0.02, y: 0.34, size: 1.00, color: Color(0x8CA3E635)), // lime
    (x: 0.55, y: 0.52, size: 0.80, color: Color(0x4016A34A)), // a deeper green, so the glass has light and dark to frost
    (x: 0.95, y: 0.68, size: 1.05, color: Color(0x8C2DD4BF)), // teal
    (x: 0.05, y: 0.97, size: 0.95, color: Color(0x994ADE80)), // fresh green
  ];
  static const orbsDark = <({double x, double y, double size, Color color})>[
    (x: 0.96, y: 0.05, size: 1.10, color: Color(0x7310B981)), // emerald
    (x: 0.02, y: 0.34, size: 1.00, color: Color(0x6616A34A)), // green
    (x: 0.95, y: 0.66, size: 1.05, color: Color(0x6614B8A6)), // teal green
    (x: 0.05, y: 0.96, size: 0.95, color: Color(0x4D65A30D)), // deep lime
  ];

  // The brand header (home, account, banners, logo tile). White text is readable on all of it.
  static const heroGradient = [Color(0xFF0F3D22), Color(0xFF14532D), Color(0xFF0E7A4B)];

  // The colours the home tiles and account rows take turns in.
  static const tileAccents = [
    Color(0xFF059669), // emerald
    Color(0xFF0284C7), // sky
    Color(0xFF7C3AED), // violet
    Color(0xFFD97706), // amber
    Color(0xFFDB2777), // pink
    Color(0xFF0D9488), // teal
  ];

  // Status colours for light surfaces (5.0:1 or better on white as text).
  static const success = Color(0xFF15803D);
  static const warning = Color(0xFFB45309);
  static const danger = Color(0xFFB91C1C);
  static const info = Color(0xFF1D4ED8);
  static const star = Color(0xFFD97706); // rating stars

  /// What to use for each light-surface colour above when the theme is dark: the same hue, brightened.
  static final Map<Color, Color> _onDark = {
    success: const Color(0xFF4ADE80),
    warning: const Color(0xFFFBBF24),
    danger: const Color(0xFFF87171),
    info: const Color(0xFF60A5FA),
    star: const Color(0xFFFBBF24),
    tileAccents[0]: const Color(0xFF34D399),
    tileAccents[1]: const Color(0xFF38BDF8),
    tileAccents[2]: const Color(0xFFA78BFA),
    tileAccents[3]: const Color(0xFFFBBF24),
    tileAccents[4]: const Color(0xFFF472B6),
    tileAccents[5]: const Color(0xFF2DD4BF),
  };

  /// [color] as it should look in the current theme. In the light theme it is returned as it is; in the dark theme the
  /// status and accent colours are replaced by their brighter twins, so they keep their contrast on dark cards.
  static Color adapt(BuildContext context, Color color) {
    if (Theme.of(context).brightness != Brightness.dark) return color;
    return _onDark[color] ?? color;
  }
}
