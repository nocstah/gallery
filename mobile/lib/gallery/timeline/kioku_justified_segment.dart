import 'dart:async';
import 'dart:math' as math;

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/domain/services/timeline.service.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/gallery/timeline/kioku_row_cuts.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/asset_viewer.page.dart';
import 'package:immich_mobile/presentation/widgets/images/thumbnail_tile.widget.dart';
import 'package:immich_mobile/presentation/widgets/timeline/fixed/row.dart';
import 'package:immich_mobile/presentation/widgets/timeline/segment.model.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline.state.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline_drag_region.dart';
import 'package:immich_mobile/providers/asset_viewer/is_motion_video_playing.provider.dart';
import 'package:immich_mobile/providers/haptic_feedback.provider.dart';
import 'package:immich_mobile/providers/infrastructure/current_album.provider.dart';
import 'package:immich_mobile/providers/infrastructure/readonly_mode.provider.dart';
import 'package:immich_mobile/providers/infrastructure/timeline.provider.dart';
import 'package:immich_mobile/providers/timeline/highlighted_asset.provider.dart';
import 'package:immich_mobile/providers/timeline/multiselect.provider.dart';
import 'package:immich_mobile/routing/router.dart';
import 'package:immich_mobile/widgets/asset_grid/thumbnail_placeholder.dart';

/// Callback invoked when a rendered row belongs to a chunk whose real aspect
/// ratios have not yet been cached.
typedef KiokuChunkRequestCallback = void Function(int chunkIndex);

/// A headerless segment of variable-height justified rows produced by the Kioku
/// desktop tiling formula.
///
/// Unlike [FixedSegment], there is no header child at `firstIndex`: every child
/// index in `[firstIndex, lastIndex]` renders a photo row, so days and months
/// flow continuously with zero blank trailing rows and zero date headers.
class KiokuJustifiedSegment extends Segment {
  final List<KiokuJustifiedRow> rows;

  /// Monotonic revision bumped whenever any chunk in the timeline resolves its
  /// exact ratios, ensuring [RenderSliverTimelineBoxAdaptor] never skips layout.
  final int layoutVersion;

  final KiokuChunkRequestCallback? onRequestChunk;

  const KiokuJustifiedSegment({
    required super.firstIndex,
    required super.lastIndex,
    required super.startOffset,
    required super.endOffset,
    required super.firstAssetIndex,
    required super.bucket,
    required super.spacing,
    required this.rows,
    required this.layoutVersion,
    this.onRequestChunk,
  }) : super(headerExtent: 0.0, header: HeaderType.none);

  @override
  double indexToLayoutOffset(int index) {
    final rel = index - firstIndex;
    if (rel <= 0 || rows.isEmpty) {
      return startOffset;
    }
    if (rel >= rows.length) {
      return endOffset;
    }
    return startOffset + rows[rel].top;
  }

  @override
  int getMinChildIndexForScrollOffset(double scrollOffset) {
    if (rows.isEmpty) {
      return firstIndex;
    }
    final local = scrollOffset - startOffset;
    if (!local.isFinite || local <= 0) {
      return firstIndex;
    }

    // Binary search for the first row whose bottom + spacing extends past `local`.
    var lo = 0;
    var hi = rows.length - 1;
    while (lo < hi) {
      final mid = (lo + hi) >> 1;
      final row = rows[mid];
      if (row.top + row.height + spacing <= local) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return firstIndex + lo;
  }

  @override
  int getMaxChildIndexForScrollOffset(double scrollOffset) {
    if (rows.isEmpty) {
      return firstIndex;
    }
    final local = scrollOffset - startOffset;
    if (!local.isFinite || local <= 0) {
      return firstIndex;
    }

    // Binary search for the last row whose top <= `local`.
    var lo = 0;
    var hi = rows.length - 1;
    while (lo < hi) {
      final mid = (lo + hi + 1) >> 1;
      if (rows[mid].top <= local) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return firstIndex + lo;
  }

  @override
  int firstAssetIndexForChild(int childIndex, int columnCount) {
    if (rows.isEmpty) {
      return firstAssetIndex;
    }
    final rel = (childIndex - firstIndex).clamp(0, rows.length - 1);
    return rows[rel].firstAssetIndex;
  }

  @override
  double? offsetForAsset(int assetIndexInTimeline, int columnCount) {
    if (rows.isEmpty) {
      return null;
    }
    final lastRow = rows.last;
    if (assetIndexInTimeline < rows.first.firstAssetIndex ||
        assetIndexInTimeline >= lastRow.firstAssetIndex + lastRow.assetCount) {
      return null;
    }
    var lo = 0;
    var hi = rows.length - 1;
    while (lo <= hi) {
      final mid = (lo + hi) >> 1;
      final row = rows[mid];
      if (assetIndexInTimeline < row.firstAssetIndex) {
        hi = mid - 1;
      } else if (assetIndexInTimeline >= row.firstAssetIndex + row.assetCount) {
        lo = mid + 1;
      } else {
        return startOffset + row.top;
      }
    }
    return null;
  }

  /// Resolves the anchor `(assetIndex, offsetWithinRow)` at [scrollOffset] so
  /// scroll position stays locked when a chunk above the viewport refines.
  ({int assetIndex, double offsetWithinRow})? anchorAtOffset(double scrollOffset) {
    if (rows.isEmpty) {
      return null;
    }
    final childIndex = getMinChildIndexForScrollOffset(scrollOffset);
    final rel = (childIndex - firstIndex).clamp(0, rows.length - 1);
    final row = rows[rel];
    final rowOffset = startOffset + row.top;
    return (assetIndex: row.firstAssetIndex, offsetWithinRow: math.max(0.0, scrollOffset - rowOffset));
  }

  @override
  Widget builder(BuildContext context, int index) {
    final rel = index - firstIndex;
    if (rel < 0 || rel >= rows.length) {
      return const SizedBox.shrink();
    }
    return _KiokuJustifiedRowWidget(
      row: rows[rel],
      spacing: spacing,
      onRequestChunk: onRequestChunk,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) {
      return true;
    }
    return other is KiokuJustifiedSegment &&
        super == other &&
        other.layoutVersion == layoutVersion &&
        other.rows.length == rows.length;
  }

  @override
  int get hashCode => Object.hash(super.hashCode, layoutVersion, rows.length);
}

class _KiokuJustifiedRowWidget extends ConsumerWidget {
  final KiokuJustifiedRow row;
  final double spacing;
  final KiokuChunkRequestCallback? onRequestChunk;

  const _KiokuJustifiedRowWidget({
    required this.row,
    required this.spacing,
    this.onRequestChunk,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final timelineService = ref.watch(timelineServiceProvider);
    final hasRange = timelineService.hasRange(row.firstAssetIndex, row.assetCount);

    if (!row.isExact && onRequestChunk != null) {
      final deferred = ref.read(timelineStateProvider.select((s) => s.recommendDeferredLoading));
      if (!deferred || hasRange) {
        scheduleMicrotask(() => onRequestChunk!(row.chunkIndex));
      }
    }

    if (hasRange) {
      return _buildAssetRow(
        context,
        timelineService.getAssets(row.firstAssetIndex, row.assetCount),
        timelineService,
      );
    }

    late final Future<List<BaseAsset>> assetsFuture = timelineService.loadAssets(row.firstAssetIndex, row.assetCount);
    return _KiokuDeferredRowLoader(
      key: ValueKey('kioku_row_${row.firstAssetIndex}_${row.assetCount}'),
      placeholder: _buildPlaceholder,
      builder: (context) {
        if (!row.isExact && onRequestChunk != null) {
          scheduleMicrotask(() => onRequestChunk!(row.chunkIndex));
        }
        return FutureBuilder<List<BaseAsset>>(
          future: assetsFuture,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done || !snapshot.hasData) {
              return _buildPlaceholder(context);
            }
            if (!row.isExact && onRequestChunk != null) {
              scheduleMicrotask(() => onRequestChunk!(row.chunkIndex));
            }
            return _buildAssetRow(context, snapshot.requireData, timelineService);
          },
        );
      },
    );
  }

  Widget _buildPlaceholder(BuildContext context) {
    return RepaintBoundary(
      child: TimelineRow(
        height: row.height,
        widths: row.widths,
        spacing: spacing,
        textDirection: Directionality.of(context),
        children: [
          for (var i = 0; i < row.widths.length; i++) ThumbnailPlaceholder(width: row.widths[i], height: row.height),
        ],
      ),
    );
  }

  Widget _buildAssetRow(BuildContext context, List<BaseAsset> assets, TimelineService timelineService) {
    final count = math.min(assets.length, row.widths.length);
    final widths = count == row.widths.length ? row.widths : row.widths.sublist(0, count);
    final children = [
      for (var i = 0; i < count; i++)
        TimelineAssetIndexWrapper(
          assetIndex: row.firstAssetIndex + i,
          segmentIndex: 0,
          child: _KiokuTileWidget(
            key: ValueKey(Object.hash(assets[i].heroTag, row.firstAssetIndex + i, timelineService.hashCode)),
            asset: assets[i],
            assetIndex: row.firstAssetIndex + i,
            size: Size(widths[i], row.height),
            monthMark: row.monthMarks[i],
          ),
        ),
    ];

    return TimelineDragRegion(
      child: TimelineRow(
        height: row.height,
        widths: widths,
        spacing: spacing,
        textDirection: Directionality.of(context),
        children: children,
      ),
    );
  }
}

class _KiokuDeferredRowLoader extends ConsumerStatefulWidget {
  final WidgetBuilder placeholder;
  final WidgetBuilder builder;

  const _KiokuDeferredRowLoader({super.key, required this.placeholder, required this.builder});

  @override
  ConsumerState<_KiokuDeferredRowLoader> createState() => _KiokuDeferredRowLoaderState();
}

class _KiokuDeferredRowLoaderState extends ConsumerState<_KiokuDeferredRowLoader> {
  bool _isLoading = false;

  @override
  Widget build(BuildContext context) {
    if (!_isLoading && ref.watch(timelineStateProvider.select((state) => state.recommendDeferredLoading))) {
      return widget.placeholder(context);
    }

    _isLoading = true;
    return widget.builder(context);
  }
}

class _KiokuTileWidget extends ConsumerWidget {
  final BaseAsset asset;
  final int assetIndex;
  final Size size;
  final String? monthMark;

  const _KiokuTileWidget({
    super.key,
    required this.asset,
    required this.assetIndex,
    required this.size,
    this.monthMark,
  });

  Future<void> _handleOnTap(
    BuildContext ctx,
    WidgetRef ref,
    int? heroOffset,
    Size remoteSize,
  ) async {
    final multiSelectState = ref.read(multiSelectProvider);

    if (multiSelectState.forceEnable || multiSelectState.isEnabled) {
      ref.read(multiSelectProvider.notifier).toggleAssetSelection(asset);
    } else {
      await ref.read(timelineServiceProvider).loadAssets(assetIndex, 1);
      if (!ctx.mounted) {
        return;
      }

      ref.read(isPlayingMotionVideoProvider.notifier).playing = false;
      AssetViewer.setAsset(ref, asset, thumbnailSize: remoteSize);
      unawaited(
        ctx.pushRoute(
          AssetViewerRoute(
            initialIndex: assetIndex,
            timelineService: ref.read(timelineServiceProvider),
            heroOffset: heroOffset,
            currentAlbum: ref.read(currentRemoteAlbumProvider),
          ),
        ),
      );
    }
  }

  void _handleOnLongPress(WidgetRef ref) {
    final multiSelectState = ref.read(multiSelectProvider);
    if (multiSelectState.isEnabled || multiSelectState.forceEnable) {
      return;
    }

    ref.read(hapticFeedbackProvider.notifier).heavyImpact();
    ref.read(multiSelectProvider.notifier).toggleAssetSelection(asset);
  }

  bool _getLockSelectionStatus(WidgetRef ref) {
    final lockSelectionAssets = ref.read(multiSelectProvider.select((state) => state.lockedSelectionAssets));
    if (lockSelectionAssets.isEmpty) {
      return false;
    }
    return lockSelectionAssets.any((a) => a == asset);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final remoteSize = size * MediaQuery.devicePixelRatioOf(context);
    final heroOffset = TabsRouterScope.of(context)?.controller.activeIndex ?? 0;

    final lockSelection = _getLockSelectionStatus(ref);
    final showStorageIndicator = ref.watch(timelineArgsProvider.select((args) => args.showStorageIndicator));
    final isReadonlyModeEnabled = ref.watch(readonlyModeProvider);
    final showStackIndicator = ref.watch(timelineServiceProvider).origin != TimelineOrigin.trash;
    final isHighlighted = ref.watch(timelineHighlightedAssetProvider.select((a) => isHighlightedAsset(a, asset)));

    return RepaintBoundary(
      child: GestureDetector(
        onTap: () => lockSelection ? null : _handleOnTap(context, ref, heroOffset, remoteSize),
        onLongPress: () => lockSelection || isReadonlyModeEnabled ? null : _handleOnLongPress(ref),
        child: Stack(
          fit: StackFit.passthrough,
          children: [
            ThumbnailTile(
              asset,
              remoteSize: remoteSize,
              lockSelection: lockSelection,
              showStorageIndicator: showStorageIndicator,
              showStackIndicator: showStackIndicator,
              heroOffset: heroOffset,
              monthMark: monthMark,
              tileWidth: size.width,
            ),
            Positioned.fill(
              child: IgnorePointer(
                child: AnimatedOpacity(
                  opacity: isHighlighted ? 1.0 : 0.0,
                  duration: const Duration(milliseconds: 200),
                  child: DecoratedBox(
                    decoration: BoxDecoration(border: Border.all(color: context.colorScheme.primary, width: 3)),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
