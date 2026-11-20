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
Every drawing in the app is original work, written as SVG in code, so there is nothing to license and nothing to download.

| Asset | Where | Source | Licence |
|---|---|---|---|
| Spot illustrations: devices, search, recycle, inbox, map, tools, gift, learn | `web/src/components/art/Illustrations.jsx`, shown by `EmptyState` | Drawn for this project | Project code |
| Landing hero and background layers | CSS and SVG in `web/src/components/landing/` | Drawn for this project | Project code |
| Favicon | `web/public/favicon.svg` | Drawn for this project | Project code |
| Mobile app logo (the robot-bin mascot): the launcher icon and the logo on the splash and sign-in screens | `mobile/android/app/src/main/res/mipmap-*/ic_launcher*.png`, `mobile/assets/images/logo.png` | Supplied by the project owner (cut out of its background and resized for each icon size) | Project asset |

How the illustrations are built: each is 160 by 120, uses `currentColor` at different strengths (so one drawing works on light and dark), takes the lime and mint accents from the palette, carries `aria-hidden` (they are decoration) and is a few hundred bytes. Because they are vector there is no WebP or AVIF version to make; photographs, if ever added, must be added as WebP or AVIF with their licence in the table above.

### Third-party material the app uses
| What | Used for | Licence and what it asks of us |
|---|---|---|
| Lucide icons (`lucide-react`) | Interface icons | ISC |
| OpenStreetMap map tiles | Website and phone maps | ODbL. The map must show "OpenStreetMap contributors" (both do), and tiles are fetched only when someone opens a map. Heavy use needs a tile provider of our own. |
| Leaflet and React Leaflet | Website maps | Leaflet is BSD-2-Clause; React Leaflet is Hippocratic-2.1 licensed, so check it before any commercial release (it can be replaced by plain Leaflet) |
| flutter_map | Phone maps | BSD-3-Clause |
| Nominatim (OpenStreetMap address search) | Address search through our server | ODbL data, with a usage policy (a real User-Agent, one search at a time, results kept) that the server follows |
| Inter, Plus Jakarta Sans, Manrope (fontsource) | Fonts | SIL OFL 1.1 |

### Not done
Article cover photographs and any real photography need your own files or a stock licence you choose. Until then articles show the plain gradient cover.
