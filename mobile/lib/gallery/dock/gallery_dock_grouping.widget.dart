import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/gallery/dock/gallery_dock_style.dart';
import 'package:immich_mobile/gallery/library_view.model.dart';
import 'package:immich_mobile/gallery/library_view.provider.dart';
import 'package:immich_mobile/gallery/theme/kioku_theme.provider.dart';
import 'package:immich_mobile/gallery/theme/kioku_theme_picker.widget.dart';
import 'package:immich_mobile/gallery/theme/kioku_tokens.dart';
import 'package:immich_mobile/generated/translations.g.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline_grouping_selector.widget.dart';
import 'package:immich_mobile/providers/infrastructure/settings.provider.dart';

/// A grouping row: the shared [TimelineGroupingSelector] filling the row and an optional square/rounded button at the
/// end ([GalleryDockRowButton]). The Photos dock puts display options there, the detail pages' pill puts search. The
/// button's slot opens and closes on the dock's spring. Sits on a [GalleryGlass] its host paints.
class GalleryGroupingRow extends StatelessWidget {
  final Widget? trailing;
  final bool showTrailing;
  final double trailingWidth;

  const GalleryGroupingRow({
    super.key,
    this.trailing,
    this.showTrailing = true,
    this.trailingWidth = GalleryDockRowButton.size,
  });

  static const double padding = 4;

  @override
  Widget build(BuildContext context) {
    final (duration, curve) = GalleryDockStyle.motion(context);
    final show = trailing != null && showTrailing;
    const height = GalleryDockRowButton.size;
    final slotWidth = trailingWidth;

    return Padding(
      padding: const EdgeInsets.all(padding),
      child: Row(
        children: [
          const Expanded(child: TimelineGroupingSelector(bare: true)),
          // The clamp keeps the spring's overshoot from giving the slot a negative width.
          TweenAnimationBuilder<double>(
            tween: Tween(end: show ? 1 : 0),
            duration: duration,
            curve: curve,
            builder: (context, t, child) {
              final v = t.clamp(0.0, 1.0);
              if (v == 0) {
                return const SizedBox.shrink();
              }
              return SizedBox(
                width: (slotWidth + padding) * v,
                height: height,
                child: ClipRect(
                  child: OverflowBox(
                    alignment: AlignmentDirectional.centerEnd,
                    minWidth: slotWidth,
                    maxWidth: slotWidth,
                    child: Opacity(opacity: v, child: child),
                  ),
                ),
              );
            },
            child: IgnorePointer(ignoring: !show, child: trailing),
          ),
        ],
      ),
    );
  }
}

/// The dock's grouping row, with display options at the end while the dock is unfolded.
class GalleryDockGrouping extends ConsumerWidget {
  /// Whether the display-options button shows: the unfolded dock only.
  final bool showOptions;

  const GalleryDockGrouping({super.key, required this.showOptions});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Always expose Display Options while unfolded so Kioku timeline view, grid density, gap, corners, and themes are 1 tap away.
    return GalleryGroupingRow(
      trailing: const KiokuDisplayOptionsButton(showLibraryView: true),
      showTrailing: showOptions,
    );
  }
}

/// Opens the frosted-glass Kioku Display Options popover (Compact / By date view,
/// columns, gap, corners, theme, and optional library-view filter on Photos).
class KiokuDisplayOptionsButton extends ConsumerWidget {
  final bool showLibraryView;

  const KiokuDisplayOptionsButton({super.key, this.showLibraryView = false});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final hasSpaces = showLibraryView && ref.watch(libraryViewVisibleProvider);
    final view = hasSpaces ? ref.watch(activeLibraryViewProvider) : LibraryViewMode.both;
    return GalleryDockRowButton(
      key: const Key('gallery-dock-options'),
      icon: Icons.tune_rounded,
      label: context.t.display_options,
      value: !hasSpaces
          ? null
          : switch (view) {
              LibraryViewMode.both => null,
              LibraryViewMode.personal => context.t.library_view_personal,
              LibraryViewMode.spaces => context.t.library_view_spaces,
            },
      // A view that narrows the timeline inverts the button.
      active: hasSpaces && view != LibraryViewMode.both,
      onTap: () => unawaited(_openDockViewMenu(context, includeLibraryView: showLibraryView)),
    );
  }
}

/// Opens upwards from the button: the dock sits at the bottom of the screen.
Future<void> _openDockViewMenu(BuildContext hostContext, {bool includeLibraryView = true}) {
  final box = hostContext.findRenderObject()! as RenderBox;
  final anchor = box.localToGlobal(Offset.zero) & box.size;
  final size = MediaQuery.sizeOf(hostContext);
  final rtl = Directionality.of(hostContext) == TextDirection.rtl;
  final endInset = rtl ? anchor.left : size.width - anchor.right;
  final reduced = MediaQuery.disableAnimationsOf(hostContext);
  unawaited(HapticFeedback.selectionClick());
  return showGeneralDialog<void>(
    context: hostContext,
    barrierDismissible: true,
    barrierLabel: MaterialLocalizations.of(hostContext).modalBarrierDismissLabel,
    barrierColor: Colors.transparent,
    anchorPoint: anchor.center,
    transitionDuration: reduced ? Duration.zero : const Duration(milliseconds: 220),
    pageBuilder: (_, _, _) => _DockViewMenu(
      hostContext: hostContext,
      bottom: size.height - anchor.top + 8,
      endInset: endInset,
      includeLibraryView: includeLibraryView,
    ),
    transitionBuilder: (_, animation, _, child) => FadeTransition(
      opacity: CurvedAnimation(
        parent: animation,
        curve: const Interval(0, 0.7, curve: Curves.easeOut),
      ),
      child: ScaleTransition(
        scale: Tween(begin: 0.92, end: 1.0).animate(CurvedAnimation(parent: animation, curve: Curves.easeOutCubic)),
        alignment: rtl ? const Alignment(-0.8, 1) : const Alignment(0.8, 1),
        child: child,
      ),
    ),
  );
}

class _DockViewMenu extends ConsumerWidget {
  final BuildContext hostContext;
  final double bottom;
  final double endInset;
  final bool includeLibraryView;

  const _DockViewMenu({
    required this.hostContext,
    required this.bottom,
    required this.endInset,
    required this.includeLibraryView,
  });

  static const _columnChoices = [3, 4, 5, 6];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final kioku = context.kioku;
    final width = math.min(268.0, MediaQuery.sizeOf(context).width - 24);
    final showLibraryView = includeLibraryView && ref.watch(libraryViewVisibleProvider);
    final view = showLibraryView ? ref.watch(libraryViewProvider) : LibraryViewMode.both;
    final columns = ref.watch(appConfigProvider.select((c) => c.timeline.tilesPerRow));
    final prefs = ref.watch(kiokuPrefsProvider);
    final activeSpec = ref.watch(kiokuActiveThemeSpecProvider);
    final radius = kioku.borderRadius;

    return Stack(
      children: [
        PositionedDirectional(
          bottom: bottom,
          end: math.max(12, endInset - 4),
          width: width,
          child: DecoratedBox(
            decoration: BoxDecoration(borderRadius: radius, boxShadow: kioku.popupShadow),
            child: ClipRRect(
              borderRadius: radius,
              child: BackdropFilter(
                filter: ui.ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                child: Material(
                  key: const Key('gallery-dock-view-menu'),
                  color: kioku.glassSurface,
                  shape: RoundedRectangleBorder(borderRadius: radius, side: kioku.hairlineSide),
                  child: Padding(
                    padding: const EdgeInsets.all(10),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (showLibraryView) ...[
                          Padding(
                            padding: const EdgeInsets.fromLTRB(4, 2, 4, 6),
                            child: Semantics(
                              header: true,
                              child: Text(
                                context.t.library_view_assets_shown,
                                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: kioku.glassMuted),
                              ),
                            ),
                          ),
                          for (final (mode, label, icon) in [
                            (LibraryViewMode.both, context.t.library_view_show_everything, Icons.photo_library_outlined),
                            (
                              LibraryViewMode.personal,
                              context.t.library_view_show_personal,
                              Icons.person_outline_rounded,
                            ),
                            (LibraryViewMode.spaces, context.t.library_view_show_spaces, Icons.workspaces_outlined),
                          ])
                            _MenuChoice(
                              key: Key('gallery-dock-view-${mode.name}'),
                              label: label,
                              icon: icon,
                              selected: view == mode,
                              onTap: () {
                                unawaited(HapticFeedback.selectionClick());
                                unawaited(ref.read(libraryViewProvider.notifier).set(mode));
                                Navigator.of(context).pop();
                              },
                            ),
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            child: Divider(height: 1, thickness: 1, color: kioku.hairline),
                          ),
                        ],
                        _PopoverSectionLabel(
                          label: 'Timeline view',
                          trailing: prefs.showDayLabels ? 'Grouped' : 'No dates',
                        ),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            Expanded(
                              child: _PopoverChip(
                                key: const Key('kioku-view-compact'),
                                label: 'Compact',
                                selected: !prefs.showDayLabels,
                                onTap: () {
                                  unawaited(HapticFeedback.selectionClick());
                                  ref.read(kiokuPrefsProvider.notifier).setShowDayLabels(false);
                                },
                              ),
                            ),
                            const SizedBox(width: 4),
                            Expanded(
                              child: _PopoverChip(
                                key: const Key('kioku-view-by-date'),
                                label: 'By date',
                                selected: prefs.showDayLabels,
                                onTap: () {
                                  unawaited(HapticFeedback.selectionClick());
                                  ref.read(kiokuPrefsProvider.notifier).setShowDayLabels(true);
                                },
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        _PopoverSectionLabel(label: 'Columns', trailing: '$columns'),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            for (var i = 0; i < _columnChoices.length; i++) ...[
                              if (i > 0) const SizedBox(width: 4),
                              Expanded(
                                child: _PopoverChip(
                                  label: '${_columnChoices[i]}',
                                  mono: true,
                                  selected: columns == _columnChoices[i],
                                  onTap: () {
                                    unawaited(HapticFeedback.selectionClick());
                                    unawaited(
                                      ref.read(settingsProvider).write(.timelineTilesPerRow, _columnChoices[i]),
                                    );
                                  },
                                ),
                              ),
                            ],
                          ],
                        ),
                        const SizedBox(height: 10),
                        _PopoverSectionLabel(label: 'Grid gap', trailing: '${prefs.tileGap.round()} px'),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            for (var i = 0; i < kKiokuTileGapChoices.length; i++) ...[
                              if (i > 0) const SizedBox(width: 4),
                              Expanded(
                                child: _PopoverChip(
                                  label: kKiokuTileGapChoices[i].$2,
                                  selected: (prefs.tileGap - kKiokuTileGapChoices[i].$1).abs() < 0.5,
                                  onTap: () {
                                    unawaited(HapticFeedback.selectionClick());
                                    ref.read(kiokuPrefsProvider.notifier).setTileGap(kKiokuTileGapChoices[i].$1);
                                  },
                                ),
                              ),
                            ],
                          ],
                        ),
                        const SizedBox(height: 10),
                        const _PopoverSectionLabel(label: 'Corners'),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            Expanded(
                              child: _PopoverChip(
                                label: 'Square',
                                selected: !prefs.roundedCorners,
                                onTap: () {
                                  unawaited(HapticFeedback.selectionClick());
                                  ref.read(kiokuPrefsProvider.notifier).setRoundedCorners(false);
                                },
                              ),
                            ),
                            const SizedBox(width: 4),
                            Expanded(
                              child: _PopoverChip(
                                label: 'Rounded',
                                selected: prefs.roundedCorners,
                                onTap: () {
                                  unawaited(HapticFeedback.selectionClick());
                                  ref.read(kiokuPrefsProvider.notifier).setRoundedCorners(true);
                                },
                              ),
                            ),
                          ],
                        ),
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Divider(height: 1, thickness: 1, color: kioku.hairline),
                        ),
                        InkWell(
                          borderRadius: radius,
                          onTap: () {
                            unawaited(HapticFeedback.selectionClick());
                            Navigator.of(context).pop();
                            if (hostContext.mounted) {
                              unawaited(showKiokuThemePickerSheet(hostContext));
                            }
                          },
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 7),
                            child: Row(
                              children: [
                                Icon(Icons.palette_outlined, size: 17, color: kioku.ink),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    activeSpec.name,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: kioku.ink),
                                  ),
                                ),
                                Icon(Icons.chevron_right_rounded, size: 17, color: kioku.glassMuted),
                              ],
                            ),
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
    );
  }
}

class _PopoverSectionLabel extends StatelessWidget {
  final String label;
  final String? trailing;

  const _PopoverSectionLabel({required this.label, this.trailing});

  @override
  Widget build(BuildContext context) {
    final kioku = context.kioku;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Row(
        children: [
          Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: kioku.glassMuted)),
          if (trailing != null) ...[
            const Spacer(),
            Text(trailing!, style: kioku.dataStyle(size: 11.5, color: kioku.glassMuted)),
          ],
        ],
      ),
    );
  }
}

class _PopoverChip extends StatelessWidget {
  final String label;
  final bool selected;
  final bool mono;
  final VoidCallback onTap;

  const _PopoverChip({super.key, required this.label, required this.selected, required this.onTap, this.mono = false});

  @override
  Widget build(BuildContext context) {
    final kioku = context.kioku;
    return Material(
      color: selected ? kioku.ink : Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: kioku.borderRadius, side: kioku.hairlineSide),
      child: InkWell(
        borderRadius: kioku.borderRadius,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Center(
            child: Text(
              label,
              maxLines: 1,
              style: mono
                  ? kioku.dataStyle(size: 12, color: selected ? kioku.surface : kioku.ink)
                  : TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: selected ? kioku.surface : kioku.ink,
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

class _MenuChoice extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  const _MenuChoice({super.key, required this.label, required this.icon, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final kioku = context.kioku;
    return Semantics(
      selected: selected,
      inMutuallyExclusiveGroup: true,
      button: true,
      child: Material(
        color: selected ? kioku.ink : Colors.transparent,
        borderRadius: kioku.borderRadius,
        child: InkWell(
          borderRadius: kioku.borderRadius,
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
            child: Row(
              children: [
                Icon(icon, size: 17, color: selected ? kioku.surface : kioku.glassMuted),
                const SizedBox(width: 9),
                Expanded(
                  child: Text(
                    label,
                    style: TextStyle(
                      fontSize: 13.5,
                      fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                      color: selected ? kioku.surface : kioku.ink,
                    ),
                  ),
                ),
                if (selected) Icon(Icons.check_rounded, size: 16, color: kioku.surface),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
