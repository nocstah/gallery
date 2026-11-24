import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:immich_mobile/gallery/motion/motion_tokens.dart';
import 'package:immich_mobile/gallery/motion/pressable.dart';
import 'package:immich_mobile/gallery/motion/spring_curve.dart';
import 'package:immich_mobile/gallery/theme/kioku_tokens.dart';

/// The look and motion shared by the dock and every bottom control styled like it (the detail pages' grouping pill),
/// so they cannot drift apart.
abstract final class GalleryDockStyle {
  /// Compact edge inset for Kioku's tiled floating window dock.
  static const double sideInset = 12;

  /// Distance from the screen's bottom edge. On an iPhone with a home indicator the dock sits down inside that area, as
  /// iOS's own tab bar does. Android keeps it above the safe area (at least 26 up): a swipe up from its bottom edge is
  /// the system's home gesture, so a control inside that zone would fight it.
  static double bottomInset(BuildContext context) {
    final safe = MediaQuery.paddingOf(context).bottom;
    if (Theme.of(context).platform == TargetPlatform.iOS && safe >= 20) {
      return math.max(16, safe - 14);
    }
    return math.max(26, safe);
  }

  /// The prototype's "springy" motion: a small overshoot that settles in about 0.6 s.
  static final GallerySpringCurve spring = GallerySpringCurve(
    const SpringDescription(mass: 1, stiffness: 240, damping: 21),
  );

  static Duration get springDuration => Duration(milliseconds: (spring.settleSeconds * 1000).round());

  /// The spring, or under reduced motion a short ease with no overshoot.
  static (Duration, Curve) motion(BuildContext context) =>
      GalleryMotion.reduced(context) ? (const Duration(milliseconds: 150), Curves.easeOut) : (springDuration, spring);

  static KiokuThemeTokens _tokens(ThemeData theme) =>
      theme.extension<KiokuThemeTokens>() ?? KiokuThemeTokens.fallback(theme.brightness);

  /// Active inversion: selected tab/segment flips to solid ink with surface foreground.
  static Color highlight(ThemeData theme) => _tokens(theme).ink;

  /// A selected label or icon, and an idle one.
  static Color activeForeground(ThemeData theme) => _tokens(theme).surface;
  static Color idleForeground(ThemeData theme) => _tokens(theme).glassMuted;
}

/// The frosted Kioku floating window every piece of the dock sits on.
class GalleryGlass extends StatelessWidget {
  final Widget child;

  /// The surface alone fades, so the search slot can sit bare inside the tab bar and grow its own frame when it
  /// detaches.
  final double surfaceOpacity;
  final Duration fade;

  const GalleryGlass({super.key, required this.child, this.surfaceOpacity = 1, this.fade = Duration.zero});

  @override
  Widget build(BuildContext context) {
    final kioku = context.kioku;
    final shape = RoundedRectangleBorder(borderRadius: kioku.borderRadius);
    return Stack(
      fit: StackFit.expand,
      children: [
        AnimatedOpacity(
          duration: fade,
          opacity: surfaceOpacity,
          child: DecoratedBox(
            decoration: ShapeDecoration(shape: shape, shadows: kioku.popupShadow),
            child: ClipPath(
              clipper: ShapeBorderClipper(shape: shape),
              child: BackdropFilter(
                filter: ui.ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                child: DecoratedBox(
                  decoration: ShapeDecoration(
                    color: kioku.glassSurface,
                    shape: RoundedRectangleBorder(borderRadius: kioku.borderRadius, side: kioku.hairlineSide),
                  ),
                ),
              ),
            ),
          ),
        ),
        ClipPath(
          clipper: ShapeBorderClipper(shape: shape),
          child: child,
        ),
      ],
    );
  }
}

/// A compact square/rounded button at the end of a grouping row (display options, search): bare while idle, ink-inverted
/// while [active].
class GalleryDockRowButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final String? value;
  final bool active;
  final VoidCallback onTap;

  const GalleryDockRowButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
    this.value,
    this.active = false,
  });

  static const double size = 30;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final kioku = context.kioku;
    return Semantics(
      button: true,
      label: label,
      value: value,
      excludeSemantics: true,
      child: GalleryPressable(
        pressedScale: 0.88,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onTap,
          child: SizedBox.square(
            dimension: size,
            child: DecoratedBox(
              decoration: ShapeDecoration(
                shape: RoundedRectangleBorder(borderRadius: kioku.borderRadius),
                color: active ? GalleryDockStyle.highlight(theme) : Colors.transparent,
              ),
              child: Icon(
                icon,
                size: 18,
                color: active ? GalleryDockStyle.activeForeground(theme) : kioku.ink,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
