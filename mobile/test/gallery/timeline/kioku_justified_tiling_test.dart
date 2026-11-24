import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/domain/models/timeline_grouping.model.dart';
import 'package:immich_mobile/domain/services/timeline.service.dart';
import 'package:immich_mobile/gallery/theme/kioku_theme.provider.dart';
import 'package:immich_mobile/gallery/timeline/kioku_justified_segment.dart';
import 'package:immich_mobile/gallery/timeline/kioku_justified_stream.dart';
import 'package:immich_mobile/gallery/timeline/kioku_row_cuts.dart';
import 'package:immich_mobile/presentation/widgets/timeline/fixed/segment.model.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline.state.dart';
import 'package:immich_mobile/providers/infrastructure/timeline.provider.dart';
import 'package:immich_mobile/providers/timeline/timeline_grouping.provider.dart';
import 'package:intl/date_symbol_data_local.dart';

RemoteAsset _asset(int index, {required int width, required int height, DateTime? createdAt}) {
  final ts = createdAt ?? DateTime(2026, 11, 24).subtract(Duration(hours: index));
  return RemoteAsset(
    id: 'asset-$index',
    name: 'IMG_$index.jpg',
    ownerId: 'user-1',
    checksum: 'chk-$index',
    type: AssetType.image,
    createdAt: ts,
    updatedAt: ts,
    width: width,
    height: height,
    isEdited: false,
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('en');
  });

  group('cutJustifiedRows (Kioku desktop tiling formula)', () {
    test('fills exact available width edge to edge across mixed portrait and landscape ratios on phone width', () {
      const width = 412.0;
      const spacing = 2.0;
      final targetHeight = computeKiokuTargetRowHeight(availableWidth: width, columnCount: 3, spacing: spacing);
      final ratios = [
        0.75, 1.33, 0.75, 1.5, 0.56, 1.0, 1.78, 0.75, 0.75, 1.33, // 10
        1.5, 0.75, 0.67, 1.33, 1.33, 0.75, 1.0, 1.78, 0.75, 1.5, // 20
      ];

      final rows = cutJustifiedRows(
        ratios,
        firstAssetIndex: 0,
        availableWidth: width,
        targetRowHeight: targetHeight,
        spacing: spacing,
      );

      expect(rows, isNotEmpty);
      var totalPlaced = 0;
      for (final row in rows) {
        expect(row.firstAssetIndex, totalPlaced);
        totalPlaced += row.assetCount;
        final rowTotalWidth = row.widths.fold<double>(0, (a, b) => a + b) + spacing * (row.assetCount - 1);
        expect(rowTotalWidth, closeTo(width, 0.001), reason: 'row at asset ${row.firstAssetIndex} must reach right edge');
        expect(row.height, greaterThanOrEqualTo((targetHeight * kKiokuMinScale).floor()));
        expect(row.height, lessThanOrEqualTo((targetHeight * kKiokuMaxScale).ceil() + 1));
      }
      expect(totalPlaced, ratios.length);
    });

    test('fills exact width on unfolded Galaxy Z Fold width (752 dp) with desktop-like target height', () {
      const width = 752.0;
      const spacing = 2.0;
      final targetHeight = computeKiokuTargetRowHeight(availableWidth: width, columnCount: 3, spacing: spacing);
      expect(targetHeight, closeTo(237.0, 5.0));

      final ratios = List<double>.generate(40, (i) => [0.75, 1.5, 1.33, 0.67, 1.78][i % 5]);
      final rows = cutJustifiedRows(
        ratios,
        firstAssetIndex: 0,
        availableWidth: width,
        targetRowHeight: targetHeight,
        spacing: spacing,
      );

      for (final row in rows) {
        final span = row.widths.fold<double>(0, (a, b) => a + b) + spacing * (row.assetCount - 1);
        expect(span, closeTo(width, 0.001));
      }
    });

    test('stretches slightly sparse trailing rows within MAX_STRETCH (1.35) to align flush at right edge', () {
      const width = 400.0;
      const spacing = 2.0;
      const targetHeight = 120.0;
      // Two 4:3 photos at MAX_SCALE (192px) reach 2 * 1.333 * 192 + 2 = 514 > 400 (fills naturally);
      // Two 0.75 portraits at MAX_SCALE (192px) reach 2 * 0.75 * 192 + 2 = 290, reach = 398/288 = 1.38 > 1.35 (stays short);
      // Two 0.85 portraits at MAX_SCALE (192px) reach 2 * 0.85 * 192 + 2 = 328, reach = 398/326.4 = 1.22 <= 1.35 (stretches flush!)
      final stretched = cutJustifiedRows(
        const [0.85, 0.85],
        firstAssetIndex: 0,
        availableWidth: width,
        targetRowHeight: targetHeight,
        spacing: spacing,
      );
      expect(stretched, hasLength(1));
      expect(stretched.single.widths.fold<double>(0, (a, b) => a + b) + spacing, closeTo(width, 0.001));

      // Single square photo on a 400px screen needs reach > 1.35 so it stays un-distorted rather than hugely cropped.
      final single = cutJustifiedRows(
        const [1.0],
        firstAssetIndex: 0,
        availableWidth: width,
        targetRowHeight: targetHeight,
        spacing: spacing,
      );
      expect(single, hasLength(1));
      expect(single.single.widths.single, lessThan(width));
    });

    test('clamps extreme ratios and falls back to 1.0 when dimensions are missing', () {
      expect(kiokuAssetAspectRatio(_asset(0, width: 0, height: 100)), 1.0);
      expect(kiokuAssetAspectRatio(_asset(1, width: 10000, height: 100)), kKiokuMaxAspectRatio);
      expect(kiokuAssetAspectRatio(_asset(2, width: 100, height: 10000)), kKiokuMinAspectRatio);
      expect(kiokuAssetAspectRatio(_asset(3, width: 3000, height: 4000)), closeTo(0.75, 0.0001));
    });
  });

  group('coalesceMonthBoundaries & cross-month row sharing', () {
    test('coalesces day buckets into month marks and adds year only when year changes', () {
      final buckets = [
        TimeBucket(date: DateTime(2026, 11, 24), assetCount: 2),
        TimeBucket(date: DateTime(2026, 11, 20), assetCount: 3),
        TimeBucket(date: DateTime(2026, 10, 15), assetCount: 1),
        TimeBucket(date: DateTime(2025, 12, 31), assetCount: 4),
        TimeBucket(date: DateTime(2025, 11, 5), assetCount: 2),
      ];

      final marks = coalesceMonthBoundaries(buckets, currentYear: 2026, locale: 'en');
      expect(marks.map((m) => (m.firstAssetIndex, m.label)).toList(), [
        (0, 'NOV'),
        (5, 'OCT'),
        (6, 'DEC 2025'),
        (10, 'NOV'),
      ]);
    });

    test('days and months share rows seamlessly with zero headers and contiguous offsets', () {
      final buckets = [
        TimeBucket(date: DateTime(2026, 11, 24), assetCount: 1),
        TimeBucket(date: DateTime(2026, 11, 22), assetCount: 1),
        TimeBucket(date: DateTime(2026, 10, 10), assetCount: 2),
        TimeBucket(date: DateTime(2026, 9, 1), assetCount: 6),
      ];
      final rows = cutJustifiedRows(
        const [0.75, 0.75, 1.33, 0.75, 1.5, 0.75, 1.33, 0.75, 1.0, 1.33],
        firstAssetIndex: 0,
        availableWidth: 400,
        targetRowHeight: 120,
        spacing: 2,
      );
      final boundaries = coalesceMonthBoundaries(buckets, currentYear: 2026, locale: 'en');
      final segments = assembleKiokuSegments(
        rows: rows,
        monthByAssetIndex: {for (final b in boundaries) b.firstAssetIndex: b},
        fallbackDate: boundaries.first.date,
        spacing: 2,
        layoutVersion: 1,
      );

      expect(segments, isNotEmpty);
      expect(segments.every((s) => s.header == HeaderType.none && s.headerExtent == 0), isTrue);

      // Verify SliverSegmentedList invariants: contiguous indices, contiguous offsets, exact trailing offset.
      var expectedIndex = 0;
      var expectedOffset = 0.0;
      for (final seg in segments) {
        expect(seg.firstIndex, expectedIndex);
        expect(seg.startOffset, closeTo(expectedOffset, 0.001));
        for (var i = seg.firstIndex; i <= seg.lastIndex; i++) {
          final off = seg.indexToLayoutOffset(i);
          expect(seg.getMinChildIndexForScrollOffset(off), i);
          expect(seg.getMaxChildIndexForScrollOffset(off), i);
        }
        expectedIndex = seg.lastIndex + 1;
        expectedOffset = seg.endOffset;
      }
      expect(segments.last.indexToLayoutOffset(segments.last.lastIndex + 1), closeTo(segments.last.endOffset, 0.001));

      // Verify quiet month marks are placed on asset 0 (NOV), asset 2 (OCT), and asset 4 (SEP).
      final placedMarks = <int, String>{};
      for (final seg in segments) {
        for (final row in seg.rows) {
          for (final entry in row.monthMarks.entries) {
            placedMarks[row.firstAssetIndex + entry.key] = entry.value;
          }
        }
      }
      expect(placedMarks, {0: 'NOV', 2: 'OCT', 4: 'SEP'});
    });

    test('computeKiokuChunkRanges folds tiny trailing remainders to avoid orphan 1-photo chunks', () {
      final ranges257 = computeKiokuChunkRanges(257);
      expect(ranges257, [(start: 0, count: 257)]);

      final ranges600 = computeKiokuChunkRanges(600);
      expect(ranges600, [(start: 0, count: 256), (start: 256, count: 256), (start: 512, count: 88)]);
    });
  });

  group('timelineSegmentProvider integration', () {
    test('uses KiokuJustifiedSegment on Photos when justified=true and showDayLabels=false', () async {
      final assets = [
        _asset(0, width: 3000, height: 4000, createdAt: DateTime(2026, 11, 24)),
        _asset(1, width: 4000, height: 3000, createdAt: DateTime(2026, 11, 23)),
        _asset(2, width: 3000, height: 4000, createdAt: DateTime(2026, 10, 10)),
        _asset(3, width: 4000, height: 2250, createdAt: DateTime(2026, 10, 9)),
      ];
      final service = TimelineService((
        assetSource: (offset, count) async => assets.sublist(offset, (offset + count).clamp(0, assets.length)),
        bucketSource: () => Stream.value([
          TimeBucket(date: DateTime(2026, 11, 24), assetCount: 1),
          TimeBucket(date: DateTime(2026, 11, 23), assetCount: 1),
          TimeBucket(date: DateTime(2026, 10, 10), assetCount: 1),
          TimeBucket(date: DateTime(2026, 10, 9), assetCount: 1),
        ]),
        origin: TimelineOrigin.main,
      ));

      final container = ProviderContainer(
        overrides: [
          timelineServiceProvider.overrideWithValue(service),
          timelineArgsProvider.overrideWithValue(
            const TimelineArgs(maxWidth: 412, maxHeight: 800, columnCount: 3, spacing: 2),
          ),
          timelineGroupingSpecProvider.overrideWithValue((mode: TimelineOverviewMode.all, groupBy: GroupAssetsBy.day)),
          kiokuJustifiedTimelineEnabledProvider.overrideWithValue(true),
        ],
      );
      addTearDown(() async {
        container.dispose();
        await service.dispose();
      });

      final segments = await container.read(timelineSegmentProvider.future);
      expect(segments, everyElement(isA<KiokuJustifiedSegment>()));
      expect(segments.every((s) => s.header == HeaderType.none), isTrue);

      // Turning date headers ON switches cleanly back to FixedSegment with headers.
      container.read(kiokuPrefsProvider.notifier).setShowDayLabels(true);
      final datedSegments = await container.read(timelineSegmentProvider.future);
      expect(datedSegments, everyElement(isA<FixedSegment>()));
    });
  });
}
