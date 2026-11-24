import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/events.model.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/domain/services/timeline.service.dart';
import 'package:immich_mobile/domain/utils/event_stream.dart';
import 'package:immich_mobile/gallery/timeline/kioku_justified_segment.dart';
import 'package:immich_mobile/gallery/timeline/kioku_row_cuts.dart';
import 'package:immich_mobile/presentation/widgets/timeline/segment.model.dart';

/// Whether the enclosing [Timeline] opts into Kioku's continuous justified tiling.
///
/// Overridden to `true` by [MainTimelinePage] so the Photos timeline tiles
/// continuously with zero date headers and zero black gaps while existing tests
/// and detail routes stay unaffected unless they opt in.
final kiokuJustifiedTimelineEnabledProvider = Provider<bool>((ref) => false);

/// Number of assets packed per independent justified chunk.
///
/// 256 assets (~50-65 rows) guarantees `cutJustifiedRows` fills every row of
/// the chunk edge-to-edge (making chunk seams invisible), runs in <0.3 ms on
/// mobile, and aligns 4:1 with `TimelineService`'s 1024-asset buffer batch.
const int kKiokuJustifiedChunkSize = 256;

/// Trailing remainders smaller than this fold into the preceding chunk so a
/// library of e.g. 257 photos never strands a single photo in an orphan chunk.
const int kKiokuMinTrailingChunkSize = 32;

/// Computes chunk `(start, count)` ranges partitioning [totalAssets].
List<({int start, int count})> computeKiokuChunkRanges(int totalAssets) {
  if (totalAssets <= 0) {
    return const [];
  }
  final ranges = <({int start, int count})>[];
  var cursor = 0;
  while (cursor < totalAssets) {
    final remaining = totalAssets - cursor;
    if (remaining <= kKiokuJustifiedChunkSize + kKiokuMinTrailingChunkSize - 1) {
      ranges.add((start: cursor, count: remaining));
      break;
    }
    ranges.add((start: cursor, count: kKiokuJustifiedChunkSize));
    cursor += kKiokuJustifiedChunkSize;
  }
  return ranges;
}

/// Builds a reactive stream of [KiokuJustifiedSegment]s for [buckets], backed by
/// an on-demand per-chunk aspect-ratio cache synced from [timelineService].
///
/// Chunks already inside [timelineService]'s initial 1024-asset buffer resolve
/// synchronously; remaining chunks start with analytical O(1) full-width
/// estimates and refine cleanly as they enter the scroll cache extent.
Stream<List<Segment>> watchKiokuJustifiedSegments({
  required TimelineService timelineService,
  required List<Bucket> buckets,
  required double maxWidth,
  required int columnCount,
  required double spacing,
  int? currentYear,
  String? locale,
}) {
  final totalAssets = buckets.fold<int>(0, (acc, b) => acc + b.assetCount);
  if (totalAssets == 0 || maxWidth <= 0) {
    return Stream.value(const <Segment>[]);
  }

  final edgeInset = kiokuEdgeInsetForSpacing(spacing);
  final availableWidth = math.max(1.0, maxWidth - edgeInset * 2);
  final targetRowHeight = computeKiokuTargetRowHeight(
    availableWidth: availableWidth,
    columnCount: columnCount,
    spacing: spacing,
  );
  final chunkRanges = computeKiokuChunkRanges(totalAssets);
  final monthBoundaries = coalesceMonthBoundaries(buckets, currentYear: currentYear, locale: locale);
  final monthByAssetIndex = <int, KiokuMonthBoundary>{
    for (final boundary in monthBoundaries) boundary.firstAssetIndex: boundary,
  };
  final fallbackDate = monthBoundaries.isNotEmpty ? monthBoundaries.first.date : null;

  final controller = StreamController<List<Segment>>();
  final cachedRatios = <int, Float32List>{};
  final cachedRows = <int, List<KiokuJustifiedRow>>{};
  final inFlightChunks = <int>{};
  var layoutVersion = 0;
  var closed = false;
  var observedRatioSum = 0.0;
  var observedRatioCount = 0;
  StreamSubscription<Event>? reloadSubscription;

  double assumedRatio() {
    if (observedRatioCount < 8) {
      return 1.0;
    }
    return (observedRatioSum / observedRatioCount).clamp(0.75, 1.35);
  }

  bool syncChunksFromBuffer() {
    var changed = false;
    for (var c = 0; c < chunkRanges.length; c++) {
      if (cachedRatios.containsKey(c)) {
        continue;
      }
      final range = chunkRanges[c];
      if (!timelineService.hasRange(range.start, range.count)) {
        continue;
      }
      final assets = timelineService.getAssets(range.start, range.count);
      if (assets.length != range.count) {
        continue;
      }
      final ratios = Float32List(range.count);
      for (var i = 0; i < range.count; i++) {
        final ratio = kiokuAssetAspectRatio(assets[i]);
        ratios[i] = ratio;
        observedRatioSum += ratio;
        observedRatioCount++;
      }
      cachedRatios[c] = ratios;
      cachedRows[c] = cutJustifiedRows(
        ratios,
        firstAssetIndex: range.start,
        availableWidth: availableWidth,
        targetRowHeight: targetRowHeight,
        spacing: spacing,
        chunkIndex: c,
        isExact: true,
      );
      changed = true;
    }
    return changed;
  }

  late final void Function(int chunkIndex) requestChunk;

  List<Segment> buildSegments() {
    layoutVersion++;
    final estRatio = assumedRatio();
    final allRows = <KiokuJustifiedRow>[];
    for (var c = 0; c < chunkRanges.length; c++) {
      final exact = cachedRows[c];
      if (exact != null) {
        allRows.addAll(exact);
      } else {
        final range = chunkRanges[c];
        allRows.addAll(
          estimateJustifiedRows(
            firstAssetIndex: range.start,
            assetCount: range.count,
            availableWidth: availableWidth,
            targetRowHeight: targetRowHeight,
            spacing: spacing,
            chunkIndex: c,
            assumedRatio: estRatio,
          ),
        );
      }
    }

    return assembleKiokuSegments(
      rows: allRows,
      monthByAssetIndex: monthByAssetIndex,
      fallbackDate: fallbackDate,
      spacing: spacing,
      layoutVersion: layoutVersion,
      onRequestChunk: requestChunk,
    );
  }

  void emitIfOpen() {
    if (!closed && !controller.isClosed) {
      controller.add(buildSegments());
    }
  }

  requestChunk = (int chunkIndex) {
    if (closed ||
        chunkIndex < 0 ||
        chunkIndex >= chunkRanges.length ||
        cachedRatios.containsKey(chunkIndex) ||
        inFlightChunks.contains(chunkIndex)) {
      return;
    }

    if (syncChunksFromBuffer()) {
      emitIfOpen();
      if (cachedRatios.containsKey(chunkIndex)) {
        return;
      }
    }

    // Wait for TimelineService's initial eager load (and TimelineReloadEvent)
    // before issuing an out-of-range loadAssets call (important for
    // SwappedTimelineService, which starts a 5s timer when totalAssets == 0).
    final range = chunkRanges[chunkIndex];
    if (timelineService.totalAssets < range.start + range.count) {
      return;
    }

    inFlightChunks.add(chunkIndex);
    unawaited(
      timelineService
          .loadAssets(range.start, range.count)
          .then((_) {
            inFlightChunks.remove(chunkIndex);
            if (!closed && syncChunksFromBuffer()) {
              emitIfOpen();
            }
          })
          .catchError((_) {
            inFlightChunks.remove(chunkIndex);
          }),
    );
  };

  controller.onListen = () {
    syncChunksFromBuffer();
    emitIfOpen();

    if (!cachedRatios.containsKey(0) &&
        chunkRanges.isNotEmpty &&
        timelineService.totalAssets >= chunkRanges.first.count) {
      requestChunk(0);
    }

    reloadSubscription = EventStream.shared.listen((event) {
      if (event is TimelineReloadEvent && !closed && syncChunksFromBuffer()) {
        emitIfOpen();
      }
    });
  };

  controller.onCancel = () async {
    closed = true;
    await reloadSubscription?.cancel();
    reloadSubscription = null;
    if (!controller.isClosed) {
      await controller.close();
    }
  };

  return controller.stream;
}

/// Stitches flat justified [rows] into non-empty [KiokuJustifiedSegment]s split
/// at rows where a new month begins, preserving seamless cross-month row sharing
/// while exposing accurate month anchors to [Scrubber] and [TimelineScrollDriver].
List<KiokuJustifiedSegment> assembleKiokuSegments({
  required List<KiokuJustifiedRow> rows,
  required Map<int, KiokuMonthBoundary> monthByAssetIndex,
  required DateTime? fallbackDate,
  required double spacing,
  required int layoutVersion,
  KiokuChunkRequestCallback? onRequestChunk,
}) {
  if (rows.isEmpty) {
    return const [];
  }

  final segments = <KiokuJustifiedSegment>[];
  var segRows = <KiokuJustifiedRow>[];
  DateTime? segDate = fallbackDate;
  var segFirstIndex = 0;
  var segStartOffset = 0.0;
  var segRowTop = 0.0;
  var segAssetCount = 0;

  void flushSegment({required bool isFinal}) {
    if (segRows.isEmpty) {
      return;
    }
    final lastRow = segRows.last;
    final contentHeight = lastRow.top + lastRow.height;
    final endOffset = segStartOffset + contentHeight + (isFinal ? 0.0 : spacing);
    final bucket = segDate != null
        ? TimeBucket(date: segDate, assetCount: segAssetCount)
        : Bucket(assetCount: segAssetCount);

    segments.add(
      KiokuJustifiedSegment(
        firstIndex: segFirstIndex,
        lastIndex: segFirstIndex + segRows.length - 1,
        startOffset: segStartOffset,
        endOffset: endOffset,
        firstAssetIndex: segRows.first.firstAssetIndex,
        bucket: bucket,
        spacing: spacing,
        rows: segRows,
        layoutVersion: layoutVersion,
        onRequestChunk: onRequestChunk,
      ),
    );

    segFirstIndex += segRows.length;
    segStartOffset = endOffset;
    segRows = <KiokuJustifiedRow>[];
    segRowTop = 0.0;
    segAssetCount = 0;
  }

  for (var r = 0; r < rows.length; r++) {
    final row = rows[r];
    Map<int, String>? marks;
    DateTime? rowOpeningMonthDate;

    for (var slot = 0; slot < row.assetCount; slot++) {
      final boundary = monthByAssetIndex[row.firstAssetIndex + slot];
      if (boundary != null) {
        marks ??= <int, String>{};
        marks[slot] = boundary.label;
        rowOpeningMonthDate ??= boundary.date;
      }
    }

    // Start a fresh segment when a new month opens on this row so the scrubber
    // and month drill-down jump straight to this exact row. The row itself still
    // carries trailing photos from the prior month with zero break.
    if (rowOpeningMonthDate != null && segRows.isNotEmpty) {
      flushSegment(isFinal: false);
      segDate = rowOpeningMonthDate;
    } else if (rowOpeningMonthDate != null && segRows.isEmpty) {
      segDate = rowOpeningMonthDate;
    }

    segRows.add(row.withPlacement(top: segRowTop, monthMarks: marks ?? const {}));
    segRowTop += row.height + spacing;
    segAssetCount += row.assetCount;
  }

  flushSegment(isFinal: true);
  return segments;
}
