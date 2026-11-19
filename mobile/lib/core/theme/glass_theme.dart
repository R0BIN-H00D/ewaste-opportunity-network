import 'package:material_ui/material_ui.dart';

/// The look of "liquid glass" panels, for the light and the dark theme.
///
/// A panel is a nearly clear pane that frosts what is behind it ([blur]) and tints it only slightly ([fill], lighter at the
/// top-left and bottom-right where light catches it, a little darker through the middle like smoked glass). Its thick edge
/// is what sells the glass: a bright rim that flares at two corners and fades between them ([rim]), a soft inner glow just
/// inside it ([glow]), a fine line under the top edge ([highlight]), and a hairline on the outside ([edge]) so it never melts
/// into the page. A soft shadow falls only outside the panel ([shadowColor]).
///
/// A raised piece of glass on top of a panel, such as the selected tab of the bottom bar, is brighter: [lensFill] and [lensRim].
@immutable
class GlassTheme extends ThemeExtension<GlassTheme> {
  const GlassTheme({
    required this.fill,
    required this.rim,
    required this.glow,
    required this.innerShade,
    required this.highlight,
    required this.edge,
    required this.shadowColor,
    required this.blur,
    required this.shadowBlur,
    required this.shadowDy,
    required this.field,
    required this.lensFill,
    required this.lensRim,
  });

  /// Panel tint, top-left to bottom-right (three stops).
  final List<Color> fill;

  /// The bright edge, top-left to bottom-right (three stops): strong, nearly gone, medium.
  final List<Color> rim;

  /// The soft glow just inside the edge.
  final Color glow;

  /// A soft shade just inside the bottom-right edge, which gives the pane thickness (light theme; the dark one needs none).
  final Color innerShade;

  /// The fine line under the top edge.
  final Color highlight;

  /// The hairline round the outside.
  final Color edge;
  final Color shadowColor;
  final double blur;
  final double shadowBlur;
  final double shadowDy;

  /// The fill of text fields, which sit on panels.
  final Color field;

  /// A raised piece of glass (top to bottom) and its edge.
  final List<Color> lensFill;
  final Color lensRim;

  static const light = GlassTheme(
    fill: [Color(0xC7FFFFFF), Color(0x66FFFFFF), Color(0x99FFFFFF)],
    rim: [Color(0xFFFFFFFF), Color(0x3314532D), Color(0xE6FFFFFF)],
    glow: Color(0xB3FFFFFF),
    innerShade: Color(0x290F3D22),
    highlight: Color(0xCCFFFFFF),
    edge: Color(0x3314532D),
    shadowColor: Color(0x4D0F3D22),
    blur: 22,
    shadowBlur: 32,
    shadowDy: 14,
    field: Color(0x99FFFFFF),
    lensFill: [Color(0xCCFFFFFF), Color(0x80FFFFFF)],
    lensRim: Color(0xFFFFFFFF),
  );

  static const dark = GlassTheme(
    fill: [Color(0x1AFFFFFF), Color(0x38021008), Color(0x12FFFFFF)],
    rim: [Color(0xA6FFFFFF), Color(0x0DFFFFFF), Color(0x66FFFFFF)],
    glow: Color(0x24FFFFFF),
    innerShade: Color(0x00000000),
    highlight: Color(0x38FFFFFF),
    edge: Color(0x4D000000),
    shadowColor: Color(0x66000000),
    blur: 20,
    shadowBlur: 30,
    shadowDy: 12,
    field: Color(0x330A1F14),
    lensFill: [Color(0x40FFFFFF), Color(0x14FFFFFF)],
    lensRim: Color(0xCCFFFFFF),
  );

  @override
  GlassTheme copyWith({
    List<Color>? fill,
    List<Color>? rim,
    Color? glow,
    Color? innerShade,
    Color? highlight,
    Color? edge,
    Color? shadowColor,
    double? blur,
    double? shadowBlur,
    double? shadowDy,
    Color? field,
    List<Color>? lensFill,
    Color? lensRim,
  }) =>
      GlassTheme(
        fill: fill ?? this.fill,
        rim: rim ?? this.rim,
        glow: glow ?? this.glow,
        innerShade: innerShade ?? this.innerShade,
        highlight: highlight ?? this.highlight,
        edge: edge ?? this.edge,
        shadowColor: shadowColor ?? this.shadowColor,
        blur: blur ?? this.blur,
        shadowBlur: shadowBlur ?? this.shadowBlur,
        shadowDy: shadowDy ?? this.shadowDy,
        field: field ?? this.field,
        lensFill: lensFill ?? this.lensFill,
        lensRim: lensRim ?? this.lensRim,
      );

  static List<Color> _lerpAll(List<Color> a, List<Color> b, double t) => [for (var i = 0; i < a.length; i++) Color.lerp(a[i], b[i], t)!];

  @override
  GlassTheme lerp(ThemeExtension<GlassTheme>? other, double t) {
    if (other is! GlassTheme) return this;
    return GlassTheme(
      fill: _lerpAll(fill, other.fill, t),
      rim: _lerpAll(rim, other.rim, t),
      glow: Color.lerp(glow, other.glow, t)!,
      innerShade: Color.lerp(innerShade, other.innerShade, t)!,
      highlight: Color.lerp(highlight, other.highlight, t)!,
      edge: Color.lerp(edge, other.edge, t)!,
      shadowColor: Color.lerp(shadowColor, other.shadowColor, t)!,
      blur: blur + (other.blur - blur) * t,
      shadowBlur: shadowBlur + (other.shadowBlur - shadowBlur) * t,
      shadowDy: shadowDy + (other.shadowDy - shadowDy) * t,
      field: Color.lerp(field, other.field, t)!,
      lensFill: _lerpAll(lensFill, other.lensFill, t),
      lensRim: Color.lerp(lensRim, other.lensRim, t)!,
    );
  }
}
