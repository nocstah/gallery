import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:immich_mobile/gallery/theme/kioku_theme_derive.dart';

/// Kioku design tokens attached to [ThemeData.extensions].
/// Carries the Tiled Workspace grammar from DESIGN.md so every surface reads one source of truth.
@immutable
class KiokuThemeTokens extends ThemeExtension<KiokuThemeTokens> {
  final Color surface;
  final Color ink;
  final Color muted;
  final Color hairline;
  final Color chrome;
  final Color accent;
  final Color onAccent;
  final Color danger;
  final Color glassSurface;
  final Color glassMuted;
  final double radius;
  final double tileRadius;
  final double tileGap;
  final bool compactLayout;

  const KiokuThemeTokens({
    required this.surface,
    required this.ink,
    required this.muted,
    required this.hairline,
    required this.chrome,
    required this.accent,
    required this.onAccent,
    required this.danger,
    required this.glassSurface,
    required this.glassMuted,
    required this.radius,
    required this.tileRadius,
    required this.tileGap,
    required this.compactLayout,
  });

  factory KiokuThemeTokens.fromFace(
    KiokuFacePalette face, {
    required bool roundedCorners,
    required double tileGap,
    required bool compactLayout,
  }) {
    return KiokuThemeTokens(
      surface: face.surface,
      ink: face.ink,
      muted: face.muted,
      hairline: face.hairline,
      chrome: face.chrome,
      accent: face.accent,
      onAccent: face.onAccent,
      danger: face.danger,
      glassSurface: face.glassSurface,
      glassMuted: face.glassMuted,
      radius: roundedCorners ? 8.0 : 0.0,
      tileRadius: roundedCorners ? 4.0 : 0.0,
      tileGap: tileGap,
      compactLayout: compactLayout,
    );
  }

  factory KiokuThemeTokens.fallback(Brightness brightness) {
    final derived = deriveKiokuTheme(kKiokuDefaultTheme);
    final face = brightness == Brightness.dark ? derived.dark : derived.light;
    return KiokuThemeTokens.fromFace(face, roundedCorners: false, tileGap: 4.0, compactLayout: true);
  }

  // Fixed on-photo materials (DESIGN.md §§ Colors — sit on imagery, never on theme chrome).
  static const Color badgeGlass = Color(0xA30A0A0C); // rgb(10 10 12 / 0.64) strong glass
  static const Color viewerGlass = Color(0x940A0A0C); // thin smoked glass on viewer bars
  static const Color viewerGlassEdge = Color(0x26FFFFFF); // 15% white edge hairline over dark stage
  static const Color captionScrimSmall = Color(0x8C000000); // 55% black floor for small type (>=4.5:1)
  static const Color captionScrimLarge = Color(0x7A000000); // 48% black floor for large numerals (>=3:1)

  /// Kioku's single shadow vocabulary: used ONLY on elements that float over the ground (Floats Only Rule).
  List<BoxShadow> get popupShadow => const [
    BoxShadow(color: Color(0x47000000), offset: Offset(0, 12), blurRadius: 32, spreadRadius: -8),
  ];

  BorderRadius get borderRadius => BorderRadius.circular(radius);
  BorderRadius get tileBorderRadius => BorderRadius.circular(tileRadius);
  BorderSide get hairlineSide => BorderSide(color: hairline, width: 1);
  RoundedRectangleBorder get shape => RoundedRectangleBorder(borderRadius: borderRadius, side: hairlineSide);

  /// Condensed display voice (`BricolageGrotesque`) for year/month headings and empty-state titles.
  TextStyle displayStyle({
    double size = 22,
    FontWeight weight = FontWeight.w700,
    Color? color,
    double height = 1.0,
  }) => TextStyle(
    fontFamily: 'BricolageGrotesque',
    fontSize: size,
    fontWeight: weight,
    height: height,
    letterSpacing: -size * 0.02,
    color: color ?? ink,
    fontFeatures: const [ui.FontFeature.tabularFigures()],
  );

  /// Monospace tabular voice (`GoogleSansCode`) for counts, dates, durations, EXIF, and metadata (Data Is Mono Rule).
  TextStyle dataStyle({
    double size = 12,
    FontWeight weight = FontWeight.w600,
    Color? color,
    double height = 1.2,
  }) => TextStyle(
    fontFamily: 'GoogleSansCode',
    fontSize: size,
    fontWeight: weight,
    height: height,
    color: color ?? muted,
    fontFeatures: const [ui.FontFeature.tabularFigures()],
  );

  @override
  KiokuThemeTokens copyWith({
    Color? surface,
    Color? ink,
    Color? muted,
    Color? hairline,
    Color? chrome,
    Color? accent,
    Color? onAccent,
    Color? danger,
    Color? glassSurface,
    Color? glassMuted,
    double? radius,
    double? tileRadius,
    double? tileGap,
    bool? compactLayout,
  }) => KiokuThemeTokens(
    surface: surface ?? this.surface,
    ink: ink ?? this.ink,
    muted: muted ?? this.muted,
    hairline: hairline ?? this.hairline,
    chrome: chrome ?? this.chrome,
    accent: accent ?? this.accent,
    onAccent: onAccent ?? this.onAccent,
    danger: danger ?? this.danger,
    glassSurface: glassSurface ?? this.glassSurface,
    glassMuted: glassMuted ?? this.glassMuted,
    radius: radius ?? this.radius,
    tileRadius: tileRadius ?? this.tileRadius,
    tileGap: tileGap ?? this.tileGap,
    compactLayout: compactLayout ?? this.compactLayout,
  );

  @override
  KiokuThemeTokens lerp(KiokuThemeTokens? other, double t) {
    if (other == null) {
      return this;
    }
    return KiokuThemeTokens(
      surface: Color.lerp(surface, other.surface, t) ?? surface,
      ink: Color.lerp(ink, other.ink, t) ?? ink,
      muted: Color.lerp(muted, other.muted, t) ?? muted,
      hairline: Color.lerp(hairline, other.hairline, t) ?? hairline,
      chrome: Color.lerp(chrome, other.chrome, t) ?? chrome,
      accent: Color.lerp(accent, other.accent, t) ?? accent,
      onAccent: Color.lerp(onAccent, other.onAccent, t) ?? onAccent,
      danger: Color.lerp(danger, other.danger, t) ?? danger,
      glassSurface: Color.lerp(glassSurface, other.glassSurface, t) ?? glassSurface,
      glassMuted: Color.lerp(glassMuted, other.glassMuted, t) ?? glassMuted,
      radius: ui.lerpDouble(radius, other.radius, t) ?? radius,
      tileRadius: ui.lerpDouble(tileRadius, other.tileRadius, t) ?? tileRadius,
      tileGap: ui.lerpDouble(tileGap, other.tileGap, t) ?? tileGap,
      compactLayout: t < 0.5 ? compactLayout : other.compactLayout,
    );
  }
}

extension KiokuThemeContext on BuildContext {
  KiokuThemeTokens get kioku =>
      Theme.of(this).extension<KiokuThemeTokens>() ?? KiokuThemeTokens.fallback(Theme.of(this).brightness);
}
