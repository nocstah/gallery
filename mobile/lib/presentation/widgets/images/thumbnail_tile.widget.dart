import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/extensions/duration_extensions.dart';
import 'package:immich_mobile/gallery/motion/gallery_tile.dart';
import 'package:immich_mobile/gallery/space_badge.widget.dart';
import 'package:immich_mobile/gallery/theme/kioku_tokens.dart';
import 'package:immich_mobile/presentation/widgets/images/thumbnail.widget.dart';
import 'package:immich_mobile/presentation/widgets/timeline/constants.dart';
import 'package:immich_mobile/providers/asset_viewer/asset_viewer.provider.dart';
import 'package:immich_mobile/providers/backup/asset_upload_progress.provider.dart';
import 'package:immich_mobile/providers/infrastructure/settings.provider.dart';
import 'package:immich_mobile/providers/timeline/multiselect.provider.dart';

class ThumbnailTile extends ConsumerStatefulWidget {
  const ThumbnailTile(
    this.asset, {
    this.size = kThumbnailResolution,
    this.remoteSize,
    this.showStorageIndicator = false,
    this.lockSelection = false,
    this.heroOffset,
    this.showStackIndicator = false,
    super.key,
  });

  final BaseAsset? asset;
  final Size size;

  /// Physical size to decode for remote thumbnails.
  final Size? remoteSize;
  final bool showStorageIndicator;
  final bool lockSelection;
  final int? heroOffset;
  final bool showStackIndicator;

  @override
  ConsumerState<ThumbnailTile> createState() => _ThumbnailTileState();
}

class _ThumbnailTileState extends ConsumerState<ThumbnailTile> {
  bool _hideIndicators = false;

  @override
  void dispose() {
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final asset = widget.asset;
    final kioku = context.kioku;
    final heroIndex = widget.heroOffset ?? TabsRouterScope.of(context)?.controller.activeIndex ?? 0;
    final isCurrentAsset = ref.watch(assetViewerProvider.select((current) => current.currentAsset == asset));

    final isSelected = ref.watch(
      multiSelectProvider.select((multiselect) => multiselect.selectedAssets.contains(asset)),
    );

    final bool storageIndicator =
        ref.watch(appConfigProvider.select((s) => s.timeline.storageIndicator)) && widget.showStorageIndicator;

    if (!isCurrentAsset) {
      _hideIndicators = false;
    }

    final uploadProgress = asset is LocalAsset
        ? ref.watch(assetUploadProgressProvider.select((map) => map[asset.id]))
        : null;

    final marked = isSelected || widget.lockSelection;
    final frameRadius = kioku.tileBorderRadius;

    return Stack(
      children: [
        AnimatedContainer(
          duration: Durations.short3,
          curve: Curves.easeOut,
          padding: EdgeInsets.all(marked ? 2 : 0),
          decoration: BoxDecoration(
            color: marked ? (widget.lockSelection ? kioku.chrome : kioku.accent) : Colors.transparent,
            borderRadius: frameRadius,
          ),
          child: ClipRRect(
            borderRadius: frameRadius,
            child: Stack(
              children: [
                Positioned.fill(
                  child: Hero(
                    // This key resets the hero animation when the asset is changed in the asset viewer.
                    // It doesn't seem like the best solution, and only works to reset the hero, not prime the hero of the new active asset for animation,
                    // but other solutions have failed thus far.
                    key: ValueKey(isCurrentAsset),
                    tag: '${asset?.heroTag}_$heroIndex',
                    child: GalleryTile(
                      asset: asset,
                      child: Thumbnail.fromAsset(asset: asset, size: widget.size, remoteSize: widget.remoteSize),
                    ),
                    // Placeholderbuilder used to hide indicators on first hero animation, since flightShuttleBuilder isn't called until both source and destination hero exist in widget tree.
                    placeholderBuilder: (context, heroSize, child) {
                      if (!_hideIndicators) {
                        WidgetsBinding.instance.addPostFrameCallback((_) {
                          setState(() => _hideIndicators = true);
                        });
                      }
                      return const SizedBox();
                    },
                    flightShuttleBuilder: (context, animation, direction, from, to) {
                      void animationStatusListener(AnimationStatus status) {
                        if (!mounted) {
                          return;
                        }
                        final heroInFlight = status == AnimationStatus.forward || status == AnimationStatus.reverse;
                        if (_hideIndicators != heroInFlight) {
                          setState(() => _hideIndicators = heroInFlight);
                        }
                        if (status == AnimationStatus.completed || status == AnimationStatus.dismissed) {
                          animation.removeStatusListener(animationStatusListener);
                        }
                      }

                      animation.addStatusListener(animationStatusListener);
                      return direction == HeroFlightDirection.push ? from.widget : to.widget;
                    },
                  ),
                ),
                if (!marked && kioku.tileGap >= 4.0)
                  Positioned.fill(
                    child: IgnorePointer(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          borderRadius: frameRadius,
                          border: Border.all(color: kioku.hairline, width: 1),
                        ),
                      ),
                    ),
                  ),
                if (asset != null)
                  AnimatedOpacity(
                    opacity: _hideIndicators ? 0.0 : 1.0,
                    duration: Durations.short4,
                    child: Align(
                      alignment: Alignment.topRight,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          _AssetTypeIcons(asset: asset),
                          if (widget.showStackIndicator) _StackIndicator(asset: asset),
                        ],
                      ),
                    ),
                  ),
                if (storageIndicator && asset != null)
                  AnimatedOpacity(
                    opacity: _hideIndicators ? 0.0 : 1.0,
                    duration: Durations.short4,
                    child: switch (asset.storage) {
                      AssetState.local => const Align(
                        alignment: Alignment.bottomRight,
                        child: Padding(
                          padding: EdgeInsets.only(right: 5.0, bottom: 4.0),
                          child: _TileOverlayIcon(Icons.cloud_off_outlined),
                        ),
                      ),
                      AssetState.remote => const Align(
                        alignment: Alignment.bottomRight,
                        child: Padding(
                          padding: EdgeInsets.only(right: 5.0, bottom: 4.0),
                          child: _TileOverlayIcon(Icons.cloud_outlined),
                        ),
                      ),
                      AssetState.merged => const Align(
                        alignment: Alignment.bottomRight,
                        child: Padding(
                          padding: EdgeInsets.only(right: 5.0, bottom: 4.0),
                          child: _TileOverlayIcon(Icons.cloud_done_outlined),
                        ),
                      ),
                    },
                  ),

                if (asset != null && asset.isFavorite)
                  AnimatedOpacity(
                    duration: Durations.short4,
                    opacity: _hideIndicators ? 0.0 : 1.0,
                    child: const Align(
                      alignment: Alignment.bottomLeft,
                      child: Padding(
                        padding: EdgeInsets.only(left: 5.0, bottom: 4.0),
                        child: _TileOverlayIcon(Icons.favorite_rounded),
                      ),
                    ),
                  ),
                if (asset != null) SpaceBadge(asset, hidden: _hideIndicators || isSelected || widget.lockSelection),
                if (uploadProgress != null) _UploadProgressOverlay(progress: uploadProgress),
              ],
            ),
          ),
        ),
        if (marked)
          Positioned(
            top: 5,
            left: 5,
            child: _SelectionIndicator(isLocked: widget.lockSelection),
          ),
      ],
    );
  }
}

class _SelectionIndicator extends StatelessWidget {
  final bool isLocked;

  const _SelectionIndicator({required this.isLocked});

  @override
  Widget build(BuildContext context) {
    final kioku = context.kioku;
    return Container(
      width: 20,
      height: 20,
      decoration: BoxDecoration(
        color: isLocked ? kioku.chrome : kioku.accent,
        borderRadius: kioku.tileBorderRadius,
        border: Border.all(color: isLocked ? kioku.hairline : kioku.surface, width: 1),
      ),
      child: Icon(Icons.check_rounded, size: 14, color: isLocked ? kioku.muted : kioku.onAccent),
    );
  }
}

class _GlassBadge extends StatelessWidget {
  final Widget child;

  const _GlassBadge({required this.child});

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(color: KiokuThemeTokens.badgeGlass, borderRadius: context.kioku.tileBorderRadius),
      child: Padding(padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2), child: child),
    );
  }
}

class _VideoIndicator extends StatelessWidget {
  final Duration duration;
  const _VideoIndicator(this.duration);

  @override
  Widget build(BuildContext context) {
    return _GlassBadge(
      child: Row(
        spacing: 2,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(duration.format(), style: context.kioku.dataStyle(size: 10.5, weight: FontWeight.w600, color: Colors.white)),
          const Icon(Icons.play_arrow_rounded, size: 12, color: Colors.white),
        ],
      ),
    );
  }
}

class _TileOverlayIcon extends StatelessWidget {
  final IconData icon;

  const _TileOverlayIcon(this.icon);

  @override
  Widget build(BuildContext context) {
    return Icon(
      icon,
      color: Colors.white,
      size: 14,
      shadows: const [Shadow(blurRadius: 4.0, color: Color.fromRGBO(0, 0, 0, 0.7), offset: Offset.zero)],
    );
  }
}

class _AssetTypeIcons extends StatelessWidget {
  final BaseAsset asset;

  const _AssetTypeIcons({required this.asset});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        if (asset.isVideo)
          Padding(padding: const EdgeInsets.only(right: 4.0, top: 4.0), child: _VideoIndicator(asset.duration)),
        if (asset.isAnimatedImage)
          Padding(
            padding: const EdgeInsets.only(right: 4.0, top: 4.0),
            child: _GlassBadge(
              child: Text('GIF', style: context.kioku.dataStyle(size: 10, weight: FontWeight.w700, color: Colors.white)),
            ),
          ),
      ],
    );
  }
}

class _StackIndicator extends StatelessWidget {
  final BaseAsset asset;

  const _StackIndicator({required this.asset});

  @override
  Widget build(BuildContext context) {
    if (asset is! RemoteAsset || (asset as RemoteAsset).stackId == null) {
      return const SizedBox.shrink();
    }

    return const Padding(
      padding: EdgeInsets.only(right: 4.0, top: 4.0),
      child: _GlassBadge(child: Icon(Icons.burst_mode_rounded, size: 12, color: Colors.white)),
    );
  }
}

class _UploadProgressOverlay extends StatelessWidget {
  final double progress;

  const _UploadProgressOverlay({required this.progress});

  @override
  Widget build(BuildContext context) {
    final isError = progress < 0;
    final percentage = isError ? 0 : (progress * 100).toInt();

    return Positioned.fill(
      child: ColoredBox(
        color: isError ? Colors.red.withValues(alpha: 0.6) : Colors.black54,
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (isError)
                const Icon(Icons.error_outline, color: Colors.white, size: 36)
              else
                SizedBox(
                  width: 36,
                  height: 36,
                  child: CircularProgressIndicator(
                    value: progress,
                    strokeWidth: 3,
                    backgroundColor: Colors.white24,
                    valueColor: const AlwaysStoppedAnimation<Color>(Colors.white),
                  ),
                ),
              const SizedBox(height: 4),
              Text(
                isError ? 'Error' : '$percentage%',
                style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
