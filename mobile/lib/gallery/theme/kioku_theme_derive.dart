import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// A single Omarchy / Kioku theme definition, matching `web/src/lib/theme/derive.ts` and `web/static/themes/index.json`.
@immutable
class KiokuThemeSpec {
  final String id;
  final String name;
  final Brightness mode;
  final Color background;
  final Color foreground;
  final Color accent;
  final Color? lighterBackground;

  const KiokuThemeSpec({
    required this.id,
    required this.name,
    required this.mode,
    required this.background,
    required this.foreground,
    required this.accent,
    this.lighterBackground,
  });

  factory KiokuThemeSpec.fromJson(Map<String, dynamic> json) {
    final palette = json['palette'] as Map<String, dynamic>;
    final lighter = palette['lighterBackground'] as String?;
    return KiokuThemeSpec(
      id: json['id'] as String,
      name: json['name'] as String,
      mode: json['mode'] == 'light' ? Brightness.light : Brightness.dark,
      background: hexToColor(palette['background'] as String),
      foreground: hexToColor(palette['foreground'] as String),
      accent: hexToColor(palette['accent'] as String),
      lighterBackground: lighter != null ? hexToColor(lighter) : null,
    );
  }
}

/// Kioku's built-in neutral fallback (DESIGN.md frontmatter: white paper / charcoal ink / cobalt focus).
const kKiokuDefaultTheme = KiokuThemeSpec(
  id: '',
  name: 'Kioku Neutral',
  mode: Brightness.light,
  background: Color(0xFFFFFFFF),
  foreground: Color(0xFF1F1F1F),
  accent: Color(0xFF0B57D0),
);

/// Derived color roles for one face (light or dark) of a [KiokuThemeSpec].
/// Mirrors `Face` in `web/src/lib/theme/derive.ts` and the semantic rules in DESIGN.md.
@immutable
class KiokuFacePalette {
  final Brightness brightness;
  final Color surface;
  final Color ink;
  final Color muted;
  final Color hairline;
  final Color chrome;
  final Color gray;
  final Color accent;
  final Color onAccent;
  final Color danger;
  final Color glassSurface;
  final Color glassMuted;

  const KiokuFacePalette({
    required this.brightness,
    required this.surface,
    required this.ink,
    required this.muted,
    required this.hairline,
    required this.chrome,
    required this.gray,
    required this.accent,
    required this.onAccent,
    required this.danger,
    required this.glassSurface,
    required this.glassMuted,
  });

  /// Maps Kioku's color roles onto a Flutter [ColorScheme]:
  /// - Active Border & Inversion Rule: `primary` is `ink` (active/selected states invert to ink fill + surface text),
  ///   while `secondary` holds `accent` (focus rings, text selection, cursors).
  /// - Hairline Rule: every surface container stays on or right beside `surface` (no Material two-tone slabs),
  ///   with `surfaceTint: Colors.transparent` and `outline`/`outlineVariant` set to `hairline`.
  ColorScheme toColorScheme() {
    final isDark = brightness == Brightness.dark;
    final low = mixOklab(surface, ink, 0.025);
    final mid = mixOklab(surface, ink, 0.045);
    final high = mixOklab(surface, ink, 0.07);
    final highest = mixOklab(surface, ink, 0.10);

    return ColorScheme(
      brightness: brightness,
      primary: ink,
      onPrimary: surface,
      primaryContainer: chrome,
      onPrimaryContainer: ink,
      secondary: accent,
      onSecondary: onAccent,
      secondaryContainer: chrome,
      onSecondaryContainer: ink,
      tertiary: accent,
      onTertiary: onAccent,
      tertiaryContainer: chrome,
      onTertiaryContainer: ink,
      error: danger,
      onError: surface,
      errorContainer: mixOklab(surface, danger, isDark ? 0.24 : 0.14),
      onErrorContainer: danger,
      surface: surface,
      onSurface: ink,
      surfaceDim: mixOklab(surface, ink, 0.04),
      surfaceBright: surface,
      surfaceContainerLowest: surface,
      surfaceContainerLow: low,
      surfaceContainer: mid,
      surfaceContainerHigh: high,
      surfaceContainerHighest: highest,
      onSurfaceVariant: muted,
      outline: hairline,
      outlineVariant: hairline,
      shadow: Colors.black,
      scrim: Colors.black,
      inverseSurface: ink,
      onInverseSurface: surface,
      inversePrimary: surface,
      surfaceTint: Colors.transparent,
    );
  }
}

/// Pair of derived light and dark faces for a [KiokuThemeSpec].
typedef KiokuDerivedTheme = ({KiokuFacePalette light, KiokuFacePalette dark});

const _rampPositions = [0.0, 0.035, 0.08, 0.14, 0.45, 0.56, 0.66, 0.76, 0.85, 0.925, 1.0];

/// Derives both light and dark [KiokuFacePalette]s from [spec] using OKLab mixing and WCAG contrast pushing,
/// matching `web/src/lib/theme/derive.ts` and `web/src/lib/theme/glass-density.ts`.
KiokuDerivedTheme deriveKiokuTheme(KiokuThemeSpec spec) {
  if (spec.id.isEmpty) {
    return (
      light: _buildFace(
        brightness: Brightness.light,
        surface: const Color(0xFFFFFFFF),
        ink: const Color(0xFF1F1F1F),
        rawAccent: const Color(0xFF0B57D0),
      ),
      dark: _buildFace(
        brightness: Brightness.dark,
        surface: const Color(0xFF131314),
        ink: const Color(0xFFE8E6E3),
        rawAccent: const Color(0xFF7AA2F7),
      ),
    );
  }

  final isLightTheme = spec.mode == Brightness.light;
  final hi = isLightTheme ? (spec.lighterBackground ?? spec.background) : spec.foreground;
  final lo = isLightTheme ? spec.foreground : spec.background;
  final ramp = [for (final t in _rampPositions) mixOklab(hi, lo, t)];

  final lightSurface = isLightTheme ? spec.background : ramp[0];
  final lightInk = isLightTheme ? spec.foreground : ramp[10];
  final darkSurface = isLightTheme ? ramp[10] : spec.background;
  final darkInk = isLightTheme ? ramp[0] : spec.foreground;

  return (
    light: _buildFace(brightness: Brightness.light, surface: lightSurface, ink: lightInk, rawAccent: spec.accent),
    dark: _buildFace(brightness: Brightness.dark, surface: darkSurface, ink: darkInk, rawAccent: spec.accent),
  );
}

KiokuFacePalette _buildFace({
  required Brightness brightness,
  required Color surface,
  required Color ink,
  required Color rawAccent,
}) {
  final isDark = brightness == Brightness.dark;
  final accent = pushContrast(rawAccent, surface, 5.2);
  final onAccent = wcagContrast(surface, accent) >= 4.5 ? surface : ink;
  final muted = pushContrast(mixOklab(surface, ink, 0.55), surface, 4.6);
  final hairline = mixOklab(surface, ink, 0.13);
  final chrome = mixOklab(surface, ink, 0.045);
  final gray = mixOklab(surface, ink, 0.10);

  // DESIGN.md Danger rule: danger red mixed toward theme ink (80% red on light, 65% red on dark), pushed to >=4.6:1.
  final baseDanger = isDark ? const Color(0xFFF06A65) : const Color(0xFF9F1A1C);
  final danger = pushContrast(mixOklab(ink, baseDanger, isDark ? 0.65 : 0.80), surface, 4.6);

  // DESIGN.md Glass AA rule: glass muted goes halfway toward ink, and opacity is dense enough for >=4.6:1 over photos.
  final glassMuted = mixOklab(muted, ink, 0.5);
  final glassAlpha = _computeGlassAlpha(surface: surface, mutedOnGlass: glassMuted);

  return KiokuFacePalette(
    brightness: brightness,
    surface: surface,
    ink: ink,
    muted: muted,
    hairline: hairline,
    chrome: chrome,
    gray: gray,
    accent: accent,
    onAccent: onAccent,
    danger: danger,
    glassSurface: surface.withValues(alpha: glassAlpha),
    glassMuted: glassMuted,
  );
}

/// Computes the lowest glass opacity in [0.76, 0.94] where [mutedOnGlass] keeps >=4.6:1 over both pure white and pure black photos.
double _computeGlassAlpha({required Color surface, required Color mutedOnGlass}) {
  for (var alpha = 0.76; alpha <= 0.94; alpha += 0.02) {
    final overWhite = Color.alphaBlend(surface.withValues(alpha: alpha), Colors.white);
    final overBlack = Color.alphaBlend(surface.withValues(alpha: alpha), Colors.black);
    if (wcagContrast(mutedOnGlass, overWhite) >= 4.6 && wcagContrast(mutedOnGlass, overBlack) >= 4.6) {
      return alpha;
    }
  }
  return 0.94;
}

/// Parses `#rrggbb` or `rrggbb` into an opaque [Color].
Color hexToColor(String hex) {
  final clean = hex.trim().replaceFirst('#', '');
  final value = int.parse(clean.substring(0, 6), radix: 16);
  return Color(0xFF000000 | value);
}

double _toLinear(double c) => c <= 0.04045 ? c / 12.92 : math.pow((c + 0.055) / 1.055, 2.4).toDouble();

double _toGamma(double c) => c <= 0.0031308 ? 12.92 * c : 1.055 * math.pow(c, 1.0 / 2.4).toDouble() - 0.055;

double _cbrt(double x) => x < 0 ? -math.pow(-x, 1.0 / 3.0).toDouble() : math.pow(x, 1.0 / 3.0).toDouble();

(double, double, double) _toOklab(Color c) {
  final r = _toLinear(c.r);
  final g = _toLinear(c.g);
  final b = _toLinear(c.b);
  final l = _cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  final m = _cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  final s = _cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return (
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  );
}

Color _fromOklab(double L, double a, double b) {
  final l = math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3).toDouble();
  final m = math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3).toDouble();
  final s = math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3).toDouble();
  final r = _toGamma(math.max(0.0, 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)).clamp(0.0, 1.0);
  final g = _toGamma(math.max(0.0, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)).clamp(0.0, 1.0);
  final bl = _toGamma(math.max(0.0, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)).clamp(0.0, 1.0);
  return Color.from(alpha: 1.0, red: r, green: g, blue: bl);
}

/// Mixes [a] toward [b] by [t] in OKLab perceptual space.
Color mixOklab(Color a, Color b, double t) {
  final (l1, a1, b1) = _toOklab(a);
  final (l2, a2, b2) = _toOklab(b);
  return _fromOklab(l1 + (l2 - l1) * t, a1 + (a2 - a1) * t, b1 + (b2 - b1) * t);
}

double relativeLuminance(Color c) => 0.2126 * _toLinear(c.r) + 0.7152 * _toLinear(c.g) + 0.0722 * _toLinear(c.b);

double wcagContrast(Color a, Color b) {
  final la = relativeLuminance(a);
  final lb = relativeLuminance(b);
  final hi = math.max(la, lb);
  final lo = math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/// Moves [color] in OKLab lightness away from [against] until WCAG contrast reaches [target].
Color pushContrast(Color color, Color against, double target) {
  var (L, a, b) = _toOklab(color);
  final step = relativeLuminance(against) > 0.18 ? -0.01 : 0.01;
  var current = _fromOklab(L, a, b);
  while (wcagContrast(current, against) < target && L > 0.0 && L < 1.0) {
    L = (L + step).clamp(0.0, 1.0);
    current = _fromOklab(L, a, b);
  }
  return current;
}

/// Cached catalog of all 101 Omarchy themes bundled in `assets/kioku-themes.json`.
class KiokuThemeCatalog {
  KiokuThemeCatalog._();

  static List<KiokuThemeSpec> _themes = const [];
  static bool _loaded = false;

  static List<KiokuThemeSpec> get themes => _themes;

  static Future<void> load() async {
    if (_loaded) {
      return;
    }
    try {
      final raw = await rootBundle.loadString('assets/kioku-themes.json');
      final decoded = jsonDecode(raw) as List<dynamic>;
      _themes = decoded
          .whereType<Map<String, dynamic>>()
          .map(KiokuThemeSpec.fromJson)
          .toList(growable: false);
      _loaded = true;
    } catch (_) {
      _themes = const [];
    }
  }

  static KiokuThemeSpec byId(String id) {
    if (id.isEmpty) {
      return kKiokuDefaultTheme;
    }
    for (final theme in _themes) {
      if (theme.id == id) {
        return theme;
      }
    }
    return kKiokuDefaultTheme;
  }
}
