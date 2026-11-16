# Assets, licences and contrast checks

## Contrast (WCAG 2.1, computed 2026-11-14)
| Pair | Ratio | Verdict |
|---|---:|---|
| White on `#14532D` (primary button) | 9.11 | AA |
| White on `#10B981` | 2.54 | **FAIL** — never use as button fill with white text |
| White on `#A3E635` | 1.51 | **FAIL** |
| `#1F2937` on `#A3E635` | 9.74 | AA (use for text on lime) |
| `#14532D` on `#A3E635` | 6.04 | AA |
| `#1F2937` on `#F5F8F5` | 13.72 | AA |
| `#6B7280` on `#FFFFFF` | 4.83 | AA |
| `#6B7280` on `#F5F8F5` | 4.52 | AA (borderline; avoid on tinted glass) |
| `#14532D` on `#F5F8F5` | 8.52 | AA |
| `#10B981` on `#F5F8F5` | 2.37 | **FAIL even for UI components (3:1)** → on light backgrounds use `--c-secondary-strong` `#047857` for meaningful icons/borders; keep `#10B981` for decoration/charts with labels |
| Dark: `#E8F1EB` on `#0B1712` | 15.90 | AA |
| Dark: `#9FB2A7` on `#0B1712` | 8.21 | AA |
| Dark: `#34D399` on `#0B1712` | 9.54 | AA |
| Dark: `#A3E635` on `#0B1712` | 12.16 | AA |
| Dark: `#10B981` on `#0B1712` | 7.23 | AA |
| Dark: `#0B1712` on `#34D399` | 9.54 | AA |

## Fonts (self-hosted)
Web: `@fontsource/inter`, `@fontsource/plus-jakarta-sans`, `@fontsource/manrope` (OFL).
Mobile: download the same families (OFL) into `mobile/assets/fonts/` and enable the `fonts:` block in `pubspec.yaml`. Until then Flutter uses the platform font.

## Graphics
None added yet (Phase 4). Record every asset's source and licence here.
