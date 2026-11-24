import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/extensions/datetime_extensions.dart';
import 'package:intl/intl.dart';

// Port of Kioku web's "Tiled Workspace" justified row-cutting formula:
//   web/src/lib/managers/timeline-manager/internal/row-cuts.ts
//   web/src/lib/managers/timeline-manager/internal/layout-support.svelte.ts
//   web/src/lib/utils/timeline-dates.ts
//
// Photos flow continuously across day and month boundaries with no date headers
// and no empty trailing half-rows. Each row shares one integer height chosen so
// it fills the available width edge to edge, keeping every row's height nearest
// the target height via dynamic programming.

/// Minimum height factor relative to target row height (desktop `MIN_SCALE`).
const double kKiokuMinScale = 0.72;

/// Maximum height factor relative to target row height (desktop `MAX_SCALE`).
const double kKiokuMaxScale = 1.6;

/// Penalty for a row that cannot reach the right edge even at [kKiokuMaxScale]
/// (desktop `SHORT_ROW_COST`).
const double kKiokuShortRowCost = 100.0;

/// Maximum horizontal crop-stretch factor applied when a sparse trailing row
/// falls slightly short at [kKiokuMaxScale] (desktop `MAX_STRETCH`).
const double kKiokuMaxStretch = 1.35;

/// Guards against degenerate panoramas or ultra-tall screenshots breaking a row.
const double kKiokuMinAspectRatio = 0.35;
const double kKiokuMaxAspectRatio = 3.2;

/// Safe aspect ratio (`width / height`) for [asset].
///
/// Both `RemoteAsset` (server-oriented) and `LocalAsset` (oriented during Android
/// MediaStore sync) store display-oriented dimensions. Missing or non-positive
/// dimensions fall back to a 1:1 square.
double kiokuAssetAspectRatio(BaseAsset asset) {
  final width = asset.width;
  final height = asset.height;
  if (width == null || height == null || width <= 0 || height <= 0) {
    return 1.0;
  }
  final ratio = width / height;
  if (!ratio.isFinite || ratio <= 0) {
    return 1.0;
  }
  return ratio.clamp(kKiokuMinAspectRatio, kKiokuMaxAspectRatio);
}

/// Target row height derived from the viewport width and column density setting.
///
/// Calibrated to Kioku desktop's reference heights (~100 px on narrow phones at
/// 4 columns, ~235 px on wide/unfolded tablet displays at 3 columns) so pinch
/// zoom and the Columns control scale the justified wall smoothly across phone
/// cover screens and unfolded foldables alike.
double computeKiokuTargetRowHeight({
  required double availableWidth,
  required int columnCount,
  required double spacing,
}) {
  if (availableWidth <= 0 || columnCount <= 0) {
    return 100.0;
  }
  final usable = math.max(1.0, availableWidth - spacing * (columnCount - 1));
  final target = usable / (columnCount * 1.05);
  return target.clamp(56.0, 320.0);
}

/// Edge inset matching [RenderFixedRow]: flush edge-to-edge at tight (2px) gap,
/// framed by `spacing` at compact (4px) and tiled (8px) gaps.
double kiokuEdgeInsetForSpacing(double spacing) => spacing >= 4.0 ? spacing : 0.0;

/// A single justified row produced by [cutJustifiedRows].
@immutable
class KiokuJustifiedRow {
  /// Absolute index of the first asset in this row within the timeline.
  final int firstAssetIndex;

  /// Number of assets in this row (`widths.length`).
  final int assetCount;

  /// Shared row height in logical pixels (rounded to a whole pixel).
  final double height;

  /// Exact width of each tile in this row, left-to-right.
  final List<double> widths;

  /// Top offset of this row relative to its owning [Segment.startOffset].
  final double top;

  /// Chunk index that produced this row (for on-demand aspect-ratio loading).
  final int chunkIndex;

  /// True when laid out from real asset dimensions; false while estimated.
  final bool isExact;

  /// Quiet month mark labels keyed by slot index (`0 <= slot < assetCount`) for
  /// tiles that open a month. Empty for the vast majority of rows.
  final Map<int, String> monthMarks;

  const KiokuJustifiedRow({
    required this.firstAssetIndex,
    required this.assetCount,
    required this.height,
    required this.widths,
    required this.top,
    required this.chunkIndex,
    required this.isExact,
    this.monthMarks = const {},
  });

  KiokuJustifiedRow withPlacement({required double top, required Map<int, String> monthMarks}) => KiokuJustifiedRow(
    firstAssetIndex: firstAssetIndex,
    assetCount: assetCount,
    height: height,
    widths: widths,
    top: top,
    chunkIndex: chunkIndex,
    isExact: isExact,
    monthMarks: monthMarks,
  );
}

/// A coalesced month start derived from timeline [Bucket]s.
@immutable
class KiokuMonthBoundary {
  final int firstAssetIndex;
  final DateTime date;
  final String label;

  const KiokuMonthBoundary({required this.firstAssetIndex, required this.date, required this.label});
}

/// Formats a quiet month mark matching desktop `monthMarkLabel`:
/// short uppercase month (`SEP`), plus year when [withYear] is true (`DEC 2025`).
String formatKiokuMonthMark(DateTime date, {required bool withYear, String? locale}) {
  final effectiveLocale = locale ?? resolvedDateTimeLocale();
  final shortMonth = DateFormat.MMM(effectiveLocale).format(date).toUpperCase();
  return withYear ? '$shortMonth ${date.year}' : shortMonth;
}

/// Coalesces day or month [TimeBucket]s into ordered month boundaries.
///
/// The first month includes its year only when it is not [currentYear]; every
/// subsequent month includes its year whenever the year changes from the month
/// before it.
List<KiokuMonthBoundary> coalesceMonthBoundaries(
  List<Bucket> buckets, {
  int? currentYear,
  String? locale,
}) {
  final resolvedYear = currentYear ?? DateTime.now().year;
  final result = <KiokuMonthBoundary>[];
  var assetIndex = 0;
  int? prevYear;
  int? prevMonth;

  for (final bucket in buckets) {
    if (bucket.assetCount <= 0) {
      continue;
    }
    if (bucket is TimeBucket) {
      final year = bucket.date.year;
      final month = bucket.date.month;
      if (year != prevYear || month != prevMonth) {
        final withYear = prevYear == null ? year != resolvedYear : year != prevYear;
        result.add(
          KiokuMonthBoundary(
            firstAssetIndex: assetIndex,
            date: DateTime(year, month),
            label: formatKiokuMonthMark(bucket.date, withYear: withYear, locale: locale),
          ),
        );
        prevYear = year;
        prevMonth = month;
      }
    }
    assetIndex += bucket.assetCount;
  }

  return result;
}

/// Cuts a contiguous sequence of asset aspect [ratios] into justified rows using
/// the exact Kioku desktop dynamic-programming cost function (`row-cuts.ts`) and
/// right-edge whole-pixel placement (`layout-support.svelte.ts`).
///
/// Every row minimizes `sum(ln(scale)^2 + shortPenalty)` subject to
/// `scale >= kKiokuMinScale` for multi-photo rows. Each row is rendered at one
/// shared whole-pixel height capped at `targetRowHeight * kKiokuMaxScale`, and
/// widens its tiles up to [kKiokuMaxStretch] (cropped cleanly via `BoxFit.cover`)
/// so rows align flush on the right edge without leaving black gaps.
List<KiokuJustifiedRow> cutJustifiedRows(
  List<double> ratios, {
  required int firstAssetIndex,
  required double availableWidth,
  required double targetRowHeight,
  required double spacing,
  int chunkIndex = 0,
  bool isExact = true,
}) {
  final total = ratios.length;
  if (total == 0 || availableWidth <= 0 || targetRowHeight <= 0) {
    return const [];
  }

  final prefix = Float64List(total + 1);
  for (var i = 0; i < total; i++) {
    final r = ratios[i];
    final safe = (r.isFinite && r > 0) ? r.clamp(kKiokuMinAspectRatio, kKiokuMaxAspectRatio) : 1.0;
    prefix[i + 1] = prefix[i] + safe;
  }

  // best[end]: minimum cumulative cost for photos [0, end)
  // cut[end]: starting index of the row ending at `end`
  final best = Float64List(total + 1)..fillRange(0, total + 1, double.infinity);
  final cut = Int32List(total + 1);
  best[0] = 0.0;

  for (var end = 1; end <= total; end++) {
    for (var start = end - 1; start >= 0; start--) {
      final tiles = end - start;
      final fixed = (tiles - 1) * spacing;
      final ratioSum = prefix[end] - prefix[start];
      final remainingWidth = availableWidth - fixed;
      if (tiles > 1 && remainingWidth <= 0) {
        break;
      }
      final scale = math.max(0.01, remainingWidth) / ratioSum / targetRowHeight;
      final squeezed = tiles > 1 && scale < kKiokuMinScale;
      if (squeezed) {
        break;
      }

      final prevCost = best[start];
      if (!prevCost.isFinite) {
        continue;
      }

      final isShort = scale > kKiokuMaxScale;
      final logScale = math.log(scale);
      final cost = prevCost + (logScale * logScale) + (isShort ? kKiokuShortRowCost : 0.0);
      if (cost < best[end]) {
        best[end] = cost;
        cut[end] = start;
      }
    }
  }

  // Reconstruct row boundaries [start, end) in forward order.
  final ranges = <(int, int)>[];
  for (var end = total; end > 0; end = cut[end]) {
    ranges.add((cut[end], end));
  }

  final rows = <KiokuJustifiedRow>[];
  var top = 0.0;

  for (var idx = ranges.length - 1; idx >= 0; idx--) {
    final (start, end) = ranges[idx];
    final tiles = end - start;
    final fixed = (tiles - 1) * spacing;
    final ratioSum = prefix[end] - prefix[start];
    final fill = math.max(1.0, availableWidth - fixed) / ratioSum;
    final height = math.max(1.0, math.min(fill, targetRowHeight * kKiokuMaxScale).roundToDouble());
    final reach = fill / height;
    final fillsEdge = reach <= kKiokuMaxStretch;
    final stretch = fillsEdge ? reach : 1.0;

    final widths = List<double>.filled(tiles, 0.0);
    var at = 0.0;
    for (var i = 0; i < tiles; i++) {
      final r = prefix[start + i + 1] - prefix[start + i];
      final rawWidth = r * height * stretch;
      if (fillsEdge && i == tiles - 1) {
        // Snap the trailing tile to the exact right edge to eliminate subpixel slivers.
        widths[i] = math.max(1.0, availableWidth - at);
      } else {
        final left = at.roundToDouble();
        final right = (at + rawWidth).roundToDouble();
        widths[i] = math.max(1.0, right - left);
      }
      at += widths[i] + spacing;
    }

    rows.add(
      KiokuJustifiedRow(
        firstAssetIndex: firstAssetIndex + start,
        assetCount: tiles,
        height: height,
        widths: widths,
        top: top,
        chunkIndex: chunkIndex,
        isExact: isExact,
      ),
    );
    top += height + spacing;
  }

  return rows;
}

/// Fast O(rows) uniform-ratio estimation for chunks whose assets have not yet
/// been read from SQLite. Produces full-width justified rows at [targetRowHeight]
/// without running DP over tens of thousands of unloaded items.
List<KiokuJustifiedRow> estimateJustifiedRows({
  required int firstAssetIndex,
  required int assetCount,
  required double availableWidth,
  required double targetRowHeight,
  required double spacing,
  required int chunkIndex,
  double assumedRatio = 1.0,
}) {
  if (assetCount <= 0 || availableWidth <= 0 || targetRowHeight <= 0) {
    return const [];
  }
  final safeRatio = assumedRatio.clamp(0.7, 1.4);
  final idealTileWidth = targetRowHeight * safeRatio;
  final tilesPerRow = math.max(1, ((availableWidth + spacing) / (idealTileWidth + spacing)).round());
  final fullRowCount = assetCount ~/ tilesPerRow;
  final remainder = assetCount % tilesPerRow;

  // Distribute tiles cleanly so even the last row of an estimated chunk fills edge-to-edge.
  final rowSizes = <int>[];
  if (fullRowCount == 0) {
    rowSizes.add(remainder);
  } else if (remainder == 0) {
    for (var i = 0; i < fullRowCount; i++) {
      rowSizes.add(tilesPerRow);
    }
  } else if (remainder < tilesPerRow / 2 && fullRowCount >= 1) {
    // Rebalance the last two rows instead of leaving a short stub.
    for (var i = 0; i < fullRowCount - 1; i++) {
      rowSizes.add(tilesPerRow);
    }
    final combined = tilesPerRow + remainder;
    final first = combined ~/ 2;
    rowSizes.add(first);
    rowSizes.add(combined - first);
  } else {
    for (var i = 0; i < fullRowCount; i++) {
      rowSizes.add(tilesPerRow);
    }
    rowSizes.add(remainder);
  }

  final rows = <KiokuJustifiedRow>[];
  var cursor = firstAssetIndex;
  var top = 0.0;
  for (final count in rowSizes) {
    final fixed = (count - 1) * spacing;
    final fill = math.max(1.0, availableWidth - fixed) / (count * safeRatio);
    final height = math.max(1.0, math.min(fill, targetRowHeight * kKiokuMaxScale).roundToDouble());
    final reach = fill / height;
    final fillsEdge = reach <= kKiokuMaxStretch;
    final stretch = fillsEdge ? reach : 1.0;

    final widths = List<double>.filled(count, 0.0);
    var at = 0.0;
    for (var i = 0; i < count; i++) {
      final raw = safeRatio * height * stretch;
      if (fillsEdge && i == count - 1) {
        widths[i] = math.max(1.0, availableWidth - at);
      } else {
        final left = at.roundToDouble();
        final right = (at + raw).roundToDouble();
        widths[i] = math.max(1.0, right - left);
      }
      at += widths[i] + spacing;
    }

    rows.add(
      KiokuJustifiedRow(
        firstAssetIndex: cursor,
        assetCount: count,
        height: height,
        widths: widths,
        top: top,
        chunkIndex: chunkIndex,
        isExact: false,
      ),
    );
    cursor += count;
    top += height + spacing;
  }

  return rows;
}
