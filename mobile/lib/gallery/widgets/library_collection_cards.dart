import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/extensions/asyncvalue_extensions.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/gallery/theme/kioku_tokens.dart';
import 'package:immich_mobile/generated/translations.g.dart';
import 'package:immich_mobile/presentation/widgets/images/remote_image_provider.dart';
import 'package:immich_mobile/providers/gallery_nav/gallery_tab_enum.dart';
import 'package:immich_mobile/providers/infrastructure/album.provider.dart';
import 'package:immich_mobile/providers/shared_space.provider.dart';
import 'package:immich_mobile/routing/router.dart';
import 'package:immich_mobile/utils/image_url_builder.dart';

// Gallery's Spaces and Albums cards on the Library tab, mounted by library.page.dart's _CollectionCards.

/// Where the Spaces and Albums cards sit on the Library tab: `lead` before People, `trail` after On this device. The
/// one the nav does not hold leads, so it is the first card on the tab rather than fifth. Without Spaces on the
/// server there is no lead and Albums trails, as before.
final libraryCollectionOrderProvider = Provider.autoDispose<({GalleryTabEnum? lead, GalleryTabEnum trail})>((ref) {
  if (ref.watch(galleryNavSlotsProvider).contains(GalleryTabEnum.spaces)) {
    return (lead: GalleryTabEnum.albums, trail: GalleryTabEnum.spaces);
  }
  return (lead: ref.watch(serverSupportsSpacesProvider) ? GalleryTabEnum.spaces : null, trail: GalleryTabEnum.albums);
});

/// The Library card for [tab]: Spaces or Albums.
Widget libraryCollectionCard(GalleryTabEnum tab) =>
    tab == GalleryTabEnum.spaces ? const SpacesCollectionCard() : const AlbumsCollectionCard();

double kiokuLibraryTileSize(BoxConstraints constraints, BuildContext context) {
  final available = constraints.maxWidth.isFinite ? constraints.maxWidth : context.width - 24.0;
  final cols = available > 600 ? 5 : 3;
  return ((available - (cols - 1) * 6.0) / cols).clamp(80.0, 180.0);
}

class SpacesCollectionCard extends ConsumerWidget {
  const SpacesCollectionCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final spacesAsync = ref.watch(sharedSpacesProvider);
    final kioku = context.kioku;

    return LayoutBuilder(
      builder: (context, constraints) {
        final size = kiokuLibraryTileSize(constraints, context);

        return GestureDetector(
          onTap: () => context.pushRoute(const SpacesRoute()),
          child: SizedBox(
            width: size,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  height: size,
                  width: size,
                  decoration: BoxDecoration(
                    color: kioku.surface,
                    borderRadius: kioku.borderRadius,
                    border: Border.fromBorderSide(kioku.hairlineSide),
                  ),
                  child: ClipRRect(
                    borderRadius: kioku.borderRadius,
                    child: spacesAsync.widgetWhen(
                      onLoading: () => const Center(child: CircularProgressIndicator(strokeWidth: 2)),
                      onData: (spaces) {
                        if (spaces.isEmpty) {
                          return Center(child: Icon(Icons.workspaces_outlined, size: 28, color: kioku.muted));
                        }
                        return GridView.count(
                          crossAxisCount: 2,
                          padding: const EdgeInsets.all(3),
                          crossAxisSpacing: 2,
                          mainAxisSpacing: 2,
                          physics: const NeverScrollableScrollPhysics(),
                          children: spaces.take(4).map((space) {
                            final thumbnailId = space.thumbnailAssetId.value;
                            if (thumbnailId == null) {
                              return DecoratedBox(
                                decoration: BoxDecoration(color: kioku.chrome, borderRadius: kioku.tileBorderRadius),
                                child: Icon(Icons.workspaces_outlined, size: 18, color: kioku.muted),
                              );
                            }
                            return ClipRRect(
                              borderRadius: kioku.tileBorderRadius,
                              child: Image(
                                image: RemoteImageProvider(url: getThumbnailUrlForRemoteId(thumbnailId)),
                                fit: BoxFit.cover,
                              ),
                            );
                          }).toList(),
                        );
                      },
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(top: 5, bottom: 2),
                  child: Text(
                    context.t.spaces,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: kioku.ink, fontSize: 12.5, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// Albums entry point on the Library tab.
///
/// With Spaces occupying the middle nav slot by default
/// (`SettingsKey.navShowSpaces`), the Library tab is where the albums list is
/// reached from: this card and the `albums` tile in library.page.dart's
/// `_QuickAccessButtonList` are its only two entry points.
class AlbumsCollectionCard extends ConsumerWidget {
  const AlbumsCollectionCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final albumState = ref.watch(remoteAlbumProvider);
    final albums = albumState.albums;
    final kioku = context.kioku;

    return LayoutBuilder(
      builder: (context, constraints) {
        final size = kiokuLibraryTileSize(constraints, context);

        return GestureDetector(
          key: const Key('library-albums-card'),
          onTap: () => context.pushRoute(const AlbumsRoute()),
          child: SizedBox(
            width: size,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  height: size,
                  width: size,
                  decoration: BoxDecoration(
                    color: kioku.surface,
                    borderRadius: kioku.borderRadius,
                    border: Border.fromBorderSide(kioku.hairlineSide),
                  ),
                  child: ClipRRect(
                    borderRadius: kioku.borderRadius,
                    child: albums.isEmpty
                        ? Center(child: Icon(Icons.photo_album_outlined, size: 28, color: kioku.muted))
                        : GridView.count(
                            crossAxisCount: 2,
                            padding: const EdgeInsets.all(3),
                            crossAxisSpacing: 2,
                            mainAxisSpacing: 2,
                            physics: const NeverScrollableScrollPhysics(),
                            children: albums.take(4).map((album) {
                              final thumbnailId = album.thumbnailAssetId;
                              if (thumbnailId == null) {
                                return DecoratedBox(
                                  decoration: BoxDecoration(color: kioku.chrome, borderRadius: kioku.tileBorderRadius),
                                  child: Icon(Icons.photo_album_outlined, size: 18, color: kioku.muted),
                                );
                              }
                              return ClipRRect(
                                borderRadius: kioku.tileBorderRadius,
                                child: Image(
                                  image: RemoteImageProvider(url: getThumbnailUrlForRemoteId(thumbnailId)),
                                  fit: BoxFit.cover,
                                ),
                              );
                            }).toList(),
                          ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(top: 5, bottom: 2),
                  child: Text(
                    context.t.albums,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: kioku.ink, fontSize: 12.5, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
