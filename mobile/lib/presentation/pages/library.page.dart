import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/data/store.dart';
import 'package:immich_mobile/domain/models/user.model.dart';
import 'package:immich_mobile/extensions/asyncvalue_extensions.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/gallery/cleanup/widgets/library_cleanup_button.dart';
import 'package:immich_mobile/gallery/theme/kioku_tokens.dart';
import 'package:immich_mobile/gallery/widgets/library_collection_cards.dart';
import 'package:immich_mobile/generated/translations.g.dart';
import 'package:immich_mobile/presentation/widgets/images/local_album_thumbnail.widget.dart';
import 'package:immich_mobile/presentation/widgets/images/remote_image_provider.dart';
import 'package:immich_mobile/presentation/widgets/images/thumbnail.widget.dart';
import 'package:immich_mobile/presentation/widgets/people/partner_user_avatar.widget.dart';
import 'package:immich_mobile/providers/gallery_nav/bottom_nav_height.provider.dart';
import 'package:immich_mobile/providers/infrastructure/album.provider.dart';
import 'package:immich_mobile/providers/infrastructure/memory.provider.dart';
import 'package:immich_mobile/providers/infrastructure/user.provider.dart';
import 'package:immich_mobile/providers/server_info.provider.dart';
import 'package:immich_mobile/providers/shared_space.provider.dart';
import 'package:immich_mobile/providers/user.provider.dart';
import 'package:immich_mobile/routing/router.dart';
import 'package:immich_mobile/utils/image_url_builder.dart';
import 'package:immich_mobile/widgets/common/immich_sliver_app_bar.dart';
import 'package:immich_mobile/widgets/map/map_thumbnail.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

@RoutePage()
class LibraryPage extends ConsumerWidget {
  const LibraryPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final navHeight = ref.watch(bottomNavHeightProvider);
    return Scaffold(
      body: CustomScrollView(
        slivers: [
          const ImmichSliverAppBar(snap: false, floating: false, pinned: true, showUploadButton: false),
          const _ActionButtonGrid(),
          const _CollectionCards(),
          const _QuickAccessButtonList(),
          // Bottom clearance for the floating nav pill so the last list item
          // isn't obscured when scrolled to the end.
          SliverToBoxAdapter(child: SizedBox(height: navHeight + 16)),
        ],
      ),
    );
  }
}

class _ActionButtonGrid extends ConsumerWidget {
  const _ActionButtonGrid();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isTrashEnable = ref.watch(serverInfoProvider.select((state) => state.serverFeatures.trash));

    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
      sliver: SliverToBoxAdapter(
        child: Column(
          children: [
            Row(
              children: [
                _ActionButton(
                  icon: Icons.favorite_outline_rounded,
                  onTap: () => context.pushRoute(const FavoriteRoute()),
                  label: context.t.favorites,
                ),
                const SizedBox(width: 6),
                _ActionButton(
                  icon: Icons.archive_outlined,
                  onTap: () => context.pushRoute(const ArchiveRoute()),
                  label: context.t.archived,
                ),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                _ActionButton(
                  icon: Icons.link_outlined,
                  onTap: () => context.pushRoute(const SharedLinkRoute()),
                  label: context.t.shared_links,
                ),
                isTrashEnable ? const SizedBox(width: 6) : const SizedBox.shrink(),
                isTrashEnable
                    ? _ActionButton(
                        icon: Icons.delete_outline_rounded,
                        onTap: () => context.pushRoute(const TrashRoute()),
                        label: context.t.trash,
                      )
                    : const SizedBox.shrink(),
              ],
            ),
            const LibraryCleanupButton(),
          ],
        ),
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({required this.icon, required this.onTap, required this.label});

  final IconData icon;
  final VoidCallback onTap;
  final String label;

  @override
  Widget build(BuildContext context) {
    final kioku = context.kioku;
    return Expanded(
      child: FilledButton.icon(
        onPressed: onTap,
        label: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(color: kioku.ink, fontSize: 13.5, fontWeight: FontWeight.w500),
        ),
        style: FilledButton.styleFrom(
          elevation: 0,
          minimumSize: const Size(0, 40),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
          backgroundColor: kioku.surface,
          foregroundColor: kioku.ink,
          alignment: Alignment.centerLeft,
          shape: kioku.shape,
        ),
        icon: Icon(icon, size: 18, color: kioku.ink),
      ),
    );
  }
}

class _CollectionCards extends ConsumerWidget {
  const _CollectionCards();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final order = ref.watch(libraryCollectionOrderProvider);
    return SliverPadding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      sliver: SliverToBoxAdapter(
        child: Wrap(
          spacing: 6,
          runSpacing: 8,
          children: [
            if (order.lead != null) libraryCollectionCard(order.lead!),
            const _PeopleCollectionCard(),
            const _PlacesCollectionCard(),
            const _LocalAlbumsCollectionCard(),
            libraryCollectionCard(order.trail),
            const _MemoriesCollectionCard(),
          ],
        ),
      ),
    );
  }
}

class _PeopleCollectionCard extends ConsumerWidget {
  const _PeopleCollectionCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final people = ref.watch(Store.people.all());
    final kioku = context.kioku;

    return LayoutBuilder(
      builder: (context, constraints) {
        final size = kiokuLibraryTileSize(constraints, context);

        return GestureDetector(
          onTap: () => context.pushRoute(const PeopleCollectionRoute()),
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
                    child: people.widgetWhen(
                      onLoading: () => const Center(child: CircularProgressIndicator(strokeWidth: 2)),
                      onData: (people) {
                        if (people.isEmpty) {
                          return Center(child: Icon(Icons.people_outline_rounded, size: 28, color: kioku.muted));
                        }
                        return GridView.count(
                          crossAxisCount: 2,
                          padding: const EdgeInsets.all(3),
                          crossAxisSpacing: 2,
                          mainAxisSpacing: 2,
                          physics: const NeverScrollableScrollPhysics(),
                          children: people.take(4).map((person) {
                            return ClipRRect(
                              borderRadius: kioku.tileBorderRadius,
                              child: Image(
                                fit: BoxFit.cover,
                                image: RemoteImageProvider(
                                  url: getFaceThumbnailUrl(person.id, updatedAt: person.updatedAt),
                                ),
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
                    context.t.people,
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

class _PlacesCollectionCard extends StatelessWidget {
  const _PlacesCollectionCard();

  @override
  Widget build(BuildContext context) {
    final kioku = context.kioku;
    return LayoutBuilder(
      builder: (context, constraints) {
        final size = kiokuLibraryTileSize(constraints, context);

        return GestureDetector(
          onTap: () => context.pushRoute(PlaceRoute(currentLocation: null)),
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
                    child: IgnorePointer(
                      child: MapThumbnail(
                        zoom: 8,
                        centre: const LatLng(21.44950, -157.91959),
                        showAttribution: false,
                        themeMode: context.isDarkTheme ? ThemeMode.dark : ThemeMode.light,
                      ),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(top: 5, bottom: 2),
                  child: Text(
                    context.t.places,
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

class _LocalAlbumsCollectionCard extends ConsumerWidget {
  const _LocalAlbumsCollectionCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final albums = ref.watch(localAlbumProvider);
    final kioku = context.kioku;

    return LayoutBuilder(
      builder: (context, constraints) {
        final size = kiokuLibraryTileSize(constraints, context);

        return GestureDetector(
          onTap: () => context.pushRoute(const LocalAlbumsRoute()),
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
                    child: albums.when(
                      data: (data) {
                        if (data.isEmpty) {
                          return Center(child: Icon(Icons.smartphone_outlined, size: 28, color: kioku.muted));
                        }
                        return GridView.count(
                          crossAxisCount: 2,
                          padding: const EdgeInsets.all(3),
                          crossAxisSpacing: 2,
                          mainAxisSpacing: 2,
                          physics: const NeverScrollableScrollPhysics(),
                          children: data.take(4).map((album) {
                            return ClipRRect(
                              borderRadius: kioku.tileBorderRadius,
                              child: LocalAlbumThumbnail(albumId: album.id),
                            );
                          }).toList(),
                        );
                      },
                      error: (error, _) => Center(child: Text(context.t.error_saving_image(error: error.toString()))),
                      loading: () => const Center(child: CircularProgressIndicator(strokeWidth: 2)),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(top: 5, bottom: 2),
                  child: Text(
                    context.t.on_this_device,
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

class _MemoriesCollectionCard extends ConsumerWidget {
  const _MemoriesCollectionCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final memories = ref.watch(allMemoriesProvider(false));
    final kioku = context.kioku;

    return LayoutBuilder(
      builder: (context, constraints) {
        final size = kiokuLibraryTileSize(constraints, context);

        return GestureDetector(
          onTap: () => context.pushRoute(const MemoryListRoute()),
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
                    child: memories.widgetWhen(
                      onLoading: () => const Center(child: CircularProgressIndicator(strokeWidth: 2)),
                      onData: (memories) {
                        if (memories.isEmpty) {
                          return Center(child: Icon(Icons.auto_stories_outlined, size: 28, color: kioku.muted));
                        }
                        return GridView.count(
                          crossAxisCount: 2,
                          padding: const EdgeInsets.all(3),
                          crossAxisSpacing: 2,
                          mainAxisSpacing: 2,
                          physics: const NeverScrollableScrollPhysics(),
                          children: memories.take(4).map((memory) {
                            return ClipRRect(
                              borderRadius: kioku.tileBorderRadius,
                              child: Thumbnail.remote(
                                remoteId: memory.assets[0].id,
                                thumbhash: memory.assets[0].thumbHash ?? "",
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
                    context.t.memories,
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

@visibleForTesting
final sharedWithPartnerProvider = StreamProvider.autoDispose<Iterable<Partner>>((ref) {
  final currentUser = ref.watch(currentUserProvider);
  if (currentUser == null) {
    // TODO: Refactor with a route guard to avoid this check in every provider
    return const .empty();
  }

  return ref.watch(partnerServiceProvider).search(currentUser.id, .sharedWith);
});

class _QuickAccessItem {
  final Widget leading;
  final String title;
  final VoidCallback onTap;
  final EdgeInsetsGeometry? contentPadding;

  const _QuickAccessItem({required this.leading, required this.title, required this.onTap, this.contentPadding});
}

class _QuickAccessButtonList extends ConsumerWidget {
  const _QuickAccessButtonList();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final partnerSharedWithAsync = ref.watch(sharedWithPartnerProvider);
    final partners = partnerSharedWithAsync.valueOrNull ?? [];
    final showSpaces = ref.watch(serverSupportsSpacesProvider);
    final kioku = context.kioku;

    final items = [
      if (showSpaces)
        _QuickAccessItem(
          leading: Icon(Icons.workspaces_outlined, size: 19, color: kioku.ink),
          title: context.t.spaces,
          onTap: () => context.pushRoute(const SpacesRoute()),
        ),
      _QuickAccessItem(
        leading: Icon(Icons.folder_outlined, size: 19, color: kioku.ink),
        title: context.t.folders,
        onTap: () => context.pushRoute(FolderRoute()),
      ),
      _QuickAccessItem(
        leading: Icon(Icons.lock_outline_rounded, size: 19, color: kioku.ink),
        title: context.t.locked_folder,
        onTap: () => context.pushRoute(const LockedFolderRoute()),
      ),
      _QuickAccessItem(
        leading: Icon(Icons.group_outlined, size: 19, color: kioku.ink),
        title: context.t.partners,
        onTap: () => context.pushRoute(const PartnerRoute()),
      ),
      _QuickAccessItem(
        leading: Icon(Icons.photo_album_outlined, size: 19, color: kioku.ink),
        title: context.t.albums,
        onTap: () => context.pushRoute(const AlbumsRoute()),
      ),
      for (final partner in partners)
        _QuickAccessItem(
          contentPadding: const EdgeInsets.only(left: 10.0, right: 12.0),
          leading: PartnerUserAvatar(userId: partner.id, name: partner.name),
          title: context.t.partner_list_user_photos(user: partner.name),
          onTap: () => context.pushRoute(PartnerDetailRoute(partner: partner)),
        ),
    ];

    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 24),
      sliver: SliverToBoxAdapter(
        child: Container(
          decoration: BoxDecoration(
            color: kioku.surface,
            border: Border.fromBorderSide(kioku.hairlineSide),
            borderRadius: kioku.borderRadius,
          ),
          clipBehavior: Clip.antiAlias,
          child: ListView.separated(
            shrinkWrap: true,
            padding: EdgeInsets.zero,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: items.length,
            separatorBuilder: (_, _) => Divider(height: 1, thickness: 1, color: kioku.hairline),
            itemBuilder: (context, index) {
              final item = items[index];
              return ListTile(
                dense: true,
                visualDensity: const VisualDensity(vertical: -2),
                minLeadingWidth: 26,
                contentPadding: item.contentPadding ?? const EdgeInsets.symmetric(horizontal: 12),
                leading: item.leading,
                title: Text(item.title, style: TextStyle(color: kioku.ink, fontSize: 13.5, fontWeight: FontWeight.w500)),
                trailing: Icon(Icons.chevron_right_rounded, size: 18, color: kioku.muted),
                onTap: item.onTap,
              );
            },
          ),
        ),
      ),
    );
  }
}
