import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/gallery/theme/kioku_tokens.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/asset_details/appears_in_details.widget.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/asset_details/asset_owner_details.widget.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/asset_details/date_time_details.widget.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/asset_details/description.widget.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/asset_details/drag_handle.widget.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/asset_details/location_details.widget.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/asset_details/people_details.widget.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/asset_details/rating_details.widget.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/asset_details/tag_details.widget.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/asset_details/technical_details.widget.dart';
import 'package:immich_mobile/providers/infrastructure/asset_viewer/asset.provider.dart';

class AssetDetails extends ConsumerWidget {
  final BaseAsset asset;
  final double minHeight;

  const AssetDetails({super.key, required this.asset, required this.minHeight});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final exifInfo = ref.watch(assetExifProvider(asset)).valueOrNull;

    final kioku = context.kioku;
    return Container(
      constraints: BoxConstraints(minHeight: minHeight),
      decoration: BoxDecoration(
        color: kioku.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(kioku.radius)),
        border: Border(top: kioku.hairlineSide),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const DragHandle(),
            DateTimeDetails(asset: asset, exifInfo: exifInfo),
            AssetOwnerDetails(asset: asset),
            SheetAssetDescription(asset: asset, exifInfo: exifInfo),
            PeopleDetails(asset: asset),
            LocationDetails(asset: asset, exifInfo: exifInfo),
            TechnicalDetails(asset: asset, exifInfo: exifInfo),
            RatingDetails(exifInfo: exifInfo),
            AppearsInDetails(asset: asset),
            TagDetails(asset: asset),
            SizedBox(height: context.padding.bottom + 48),
          ],
        ),
      ),
    );
  }
}
