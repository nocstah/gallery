import type { ServerFeaturesDto } from '@immich/sdk';
import {
  mdiAccountMultipleOutline,
  mdiAccountOutline,
  mdiArchive,
  mdiBackupRestore,
  mdiBellOutline,
  mdiBookOpenOutline,
  mdiBookshelf,
  mdiChartPie,
  mdiChatOutline,
  mdiClipboardTextClockOutline,
  mdiClockOutline,
  mdiCog,
  mdiCompassOutline,
  mdiContentDuplicate,
  mdiDatabaseImportOutline,
  mdiDatabaseOutline,
  mdiFileCheckOutline,
  mdiFileDocumentOutline,
  mdiFolderOutline,
  mdiHeart,
  mdiHeartPulse,
  mdiHistory,
  mdiHomeOutline,
  mdiQrcode,
  mdiImageMultiple,
  mdiImageOutline,
  mdiInboxOutline,
  mdiLinkVariant,
  mdiLockOutline,
  mdiMagnifyScan,
  mdiMap,
  mdiMapMarkerOutline,
  mdiPaletteOutline,
  mdiPlayCircleOutline,
  mdiRobotOutline,
  mdiServer,
  mdiServerOutline,
  mdiShareVariantOutline,
  mdiSync,
  mdiTagMultipleOutline,
  mdiTelevisionPlay,
  mdiToolboxOutline,
  mdiTrashCanOutline,
  mdiUndoVariant,
  mdiUpdate,
  mdiUploadOutline,
  mdiVideoOutline,
  mdiViewAgenda,
  mdiViewDashboardOutline,
} from '@mdi/js';
import { Route } from '$lib/route';
import { isAlmostExactWordMatch } from './cmdk-match';

export type NavigationCategory = 'systemSettings' | 'admin' | 'userPages';

export interface NavigationItem {
  id: string;
  category: NavigationCategory;
  labelKey: string;
  descriptionKey: string;
  icon: string;
  /** Non-empty route. All navigation items lead to a real page; stateless side-effects
   * live in the commands registry (command-items.ts) instead. */
  route: string;
  adminOnly: boolean;
  /**
   * Optional feature-flag gate. Item is hidden when
   * `featureFlagsManager.valueOrUndefined?.[featureFlag]` is falsy.
   */
  featureFlag?: keyof ServerFeaturesDto;
}

/**
 * System-settings accordions. Each item deep-links to the system-settings page with
 * the `isOpen=<key>` query param which opens the matching accordion on load.
 * Keys mirror `web/src/routes/admin/system-settings/+page.svelte` — a drift-guard
 * test in navigation-items.spec.ts grep-validates against that source file.
 */
const SYSTEM_SETTINGS_SOURCE: ReadonlyArray<[key: string, baseKey: string, icon: string]> = [
  ['authentication', 'authentication_settings', mdiLockOutline],
  ['backup', 'backup_settings', mdiBackupRestore],
  ['image', 'image_settings', mdiImageOutline],
  ['integrity-checks', 'integrity_checks_settings', mdiFileCheckOutline],
  ['job', 'job_settings', mdiSync],
  ['external-library', 'library_settings', mdiBookshelf],
  ['logging', 'logging_settings', mdiFileDocumentOutline],
  ['machine-learning', 'machine_learning_settings', mdiRobotOutline],
  ['classification', 'classification_settings', mdiMagnifyScan],
  ['location', 'map_gps_settings', mdiMapMarkerOutline],
  ['memories', 'memories_settings', mdiHistory],
  ['metadata', 'metadata_settings', mdiDatabaseOutline],
  ['nightly-tasks', 'nightly_tasks_settings', mdiClockOutline],
  ['notifications', 'notification_settings', mdiBellOutline],
  ['server', 'server_settings', mdiServerOutline],
  ['storage-template', 'storage_template_settings', mdiFolderOutline],
  ['storage-usage', 'storage_usage_settings', mdiChartPie],
  ['theme', 'theme_settings', mdiPaletteOutline],
  ['trash', 'trash_settings', mdiTrashCanOutline],
  ['user-settings', 'user_settings', mdiAccountOutline],
  ['version-check', 'version_check_settings', mdiUpdate],
  ['video-transcoding', 'transcoding_settings', mdiVideoOutline],
];

const SYSTEM_SETTINGS: readonly NavigationItem[] = SYSTEM_SETTINGS_SOURCE.map(([key, base, icon]) => ({
  id: `nav:systemSettings:${key}`,
  category: 'systemSettings' as const,
  labelKey: `admin.${base}`,
  descriptionKey: `admin.${base}_description`,
  icon,
  route: `/admin/system-settings?isOpen=${key}`,
  adminOnly: true,
}));

const ADMIN_PAGES: readonly NavigationItem[] = [
  {
    id: 'nav:admin:users',
    category: 'admin',
    labelKey: 'users',
    descriptionKey: 'admin.users_page_description',
    icon: mdiAccountMultipleOutline,
    route: '/admin/users',
    adminOnly: true,
  },
  {
    id: 'nav:admin:libraries',
    category: 'admin',
    labelKey: 'external_libraries',
    descriptionKey: 'admin.external_libraries_page_description',
    icon: mdiBookshelf,
    route: '/admin/library-management',
    adminOnly: true,
  },
  {
    id: 'nav:admin:queues',
    category: 'admin',
    labelKey: 'admin.queues',
    descriptionKey: 'admin.queues_page_description',
    icon: mdiSync,
    route: '/admin/queues',
    adminOnly: true,
  },
  {
    id: 'nav:admin:server-stats',
    category: 'admin',
    labelKey: 'server_stats',
    descriptionKey: 'admin.server_stats_page_description',
    icon: mdiServer,
    route: Route.systemStatistics(),
    adminOnly: true,
  },
  {
    id: 'nav:admin:maintenance',
    category: 'admin',
    labelKey: 'cmdk_nav_maintenance',
    descriptionKey: 'cmdk_nav_maintenance_description',
    icon: mdiCog,
    route: '/admin/maintenance',
    adminOnly: true,
  },
];

const USER_PAGES: readonly NavigationItem[] = [
  {
    id: 'nav:userPages:photos',
    category: 'userPages',
    labelKey: 'photos',
    descriptionKey: 'cmdk_nav_photos_description',
    icon: mdiImageMultiple,
    route: '/photos',
    adminOnly: false,
  },
  {
    id: 'nav:userPages:albums',
    category: 'userPages',
    labelKey: 'albums',
    descriptionKey: 'cmdk_nav_albums_description',
    icon: mdiViewAgenda,
    route: '/albums',
    adminOnly: false,
  },
  {
    id: 'nav:userPages:people',
    category: 'userPages',
    labelKey: 'people',
    descriptionKey: 'cmdk_nav_people_description',
    icon: mdiAccountMultipleOutline,
    route: '/people',
    adminOnly: false,
  },
  {
    id: 'nav:userPages:tags',
    category: 'userPages',
    labelKey: 'tags',
    descriptionKey: 'cmdk_nav_tags_description',
    icon: mdiTagMultipleOutline,
    route: '/tags',
    adminOnly: false,
  },
  {
    id: 'nav:userPages:map',
    category: 'userPages',
    labelKey: 'map',
    descriptionKey: 'cmdk_nav_map_description',
    icon: mdiMap,
    route: '/map',
    adminOnly: false,
    featureFlag: 'map',
  },
  // Local Omarchy layer: Places, after the Map as in the sidebar's Browse (only Explore's View all had led there)
  {
    id: 'nav:userPages:places',
    category: 'userPages',
    labelKey: 'places',
    descriptionKey: 'cmdk_nav_places_description',
    icon: mdiMapMarkerOutline,
    route: Route.places(),
    adminOnly: false,
  },
  // Local Omarchy layer: the page is Shared, by the sidebar's name and its own title (Ctrl+K said "Sharing"), and its
  // description says what it is now, a feed
  {
    id: 'nav:userPages:sharing',
    category: 'userPages',
    labelKey: 'shared',
    descriptionKey: 'cmdk_nav_shared_description',
    icon: mdiShareVariantOutline,
    route: '/sharing',
    adminOnly: false,
  },
  {
    id: 'nav:userPages:spaces',
    category: 'userPages',
    labelKey: 'spaces',
    descriptionKey: 'cmdk_nav_spaces_description',
    icon: mdiBookOpenOutline,
    route: '/spaces',
    adminOnly: false,
  },
  {
    id: 'nav:userPages:trash',
    category: 'userPages',
    labelKey: 'trash',
    descriptionKey: 'cmdk_nav_trash_description',
    icon: mdiTrashCanOutline,
    route: '/trash',
    adminOnly: false,
    featureFlag: 'trash',
  },
  {
    id: 'nav:userPages:favorites',
    category: 'userPages',
    labelKey: 'favorites',
    descriptionKey: 'cmdk_nav_favorites_description',
    icon: mdiHeart,
    route: '/favorites',
    adminOnly: false,
  },
  // Local Omarchy layer: the special albums, photos kept out of Photos (managers/special-albums)
  {
    id: 'nav:userPages:todo',
    category: 'userPages',
    labelKey: 'todo',
    descriptionKey: 'cmdk_nav_todo_description',
    icon: mdiClipboardTextClockOutline,
    route: '/todo',
    adminOnly: false,
  },
  {
    id: 'nav:userPages:villa',
    category: 'userPages',
    labelKey: 'villa',
    descriptionKey: 'cmdk_nav_villa_description',
    icon: mdiHomeOutline,
    route: '/villa',
    adminOnly: false,
  },
  {
    id: 'nav:userPages:qr',
    category: 'userPages',
    labelKey: 'qr',
    descriptionKey: 'cmdk_nav_qr_description',
    icon: mdiQrcode,
    route: '/qr',
    adminOnly: false,
  },
  {
    id: 'nav:userPages:archive',
    category: 'userPages',
    labelKey: 'archive',
    descriptionKey: 'cmdk_nav_archive_description',
    icon: mdiArchive,
    route: '/archive',
    adminOnly: false,
  },
  {
    id: 'nav:userPages:memories',
    category: 'userPages',
    labelKey: 'memories',
    descriptionKey: 'cmdk_nav_memories_description',
    icon: mdiHistory,
    route: Route.memories(),
    adminOnly: false,
  },
  // Local Omarchy layer: Room, the archive across the room (components/room), for every account
  {
    id: 'nav:userPages:room',
    category: 'userPages',
    labelKey: 'room',
    descriptionKey: 'cmdk_nav_room_description',
    icon: mdiTelevisionPlay,
    route: Route.room(),
    adminOnly: false,
  },
  // Local Omarchy layer: every page in the sidebar is reachable from Ctrl+K, the layer's own (command center, AI inbox
  // and its tabs, chat) and the stock ones the list above leaves out. navigation-items.spec checks the sidebar against
  // this list, so a page added there and not here fails the tests. The owner's tools (the command center, the AI inbox
  // and its tabs, chat, Utilities and Duplicates, Import) are adminOnly: the owner is the server's admin, and a family
  // account neither sees them in the sidebar nor reaches their pages ("Owner tools only for me").
  {
    id: 'nav:userPages:command',
    category: 'userPages',
    labelKey: 'command_title',
    descriptionKey: 'cmdk_nav_command_description',
    icon: mdiViewDashboardOutline,
    route: '/command',
    adminOnly: true,
  },
  {
    id: 'nav:userPages:inbox',
    category: 'userPages',
    labelKey: 'ai_inbox',
    descriptionKey: 'cmdk_nav_inbox_description',
    icon: mdiInboxOutline,
    route: '/inbox',
    adminOnly: true,
  },
  {
    id: 'nav:userPages:inbox_jobs',
    category: 'userPages',
    labelKey: 'cmdk_nav_curator_jobs',
    descriptionKey: 'cmdk_nav_curator_jobs_description',
    icon: mdiPlayCircleOutline,
    route: '/inbox?tab=jobs',
    adminOnly: true,
  },
  {
    id: 'nav:userPages:inbox_history',
    category: 'userPages',
    labelKey: 'cmdk_nav_curator_history',
    descriptionKey: 'cmdk_nav_curator_history_description',
    icon: mdiUndoVariant,
    route: '/inbox?tab=history',
    adminOnly: true,
  },
  {
    id: 'nav:userPages:inbox_health',
    category: 'userPages',
    labelKey: 'cmdk_nav_curator_health',
    descriptionKey: 'cmdk_nav_curator_health_description',
    icon: mdiHeartPulse,
    route: '/inbox?tab=health',
    adminOnly: true,
  },
  {
    id: 'nav:userPages:chat',
    category: 'userPages',
    labelKey: 'chat_title',
    descriptionKey: 'cmdk_nav_chat_description',
    icon: mdiChatOutline,
    route: '/chat',
    adminOnly: true,
  },
  {
    id: 'nav:userPages:explore',
    category: 'userPages',
    labelKey: 'explore',
    descriptionKey: 'cmdk_nav_explore_description',
    icon: mdiCompassOutline,
    route: Route.explore(),
    adminOnly: false,
    featureFlag: 'search',
  },
  {
    id: 'nav:userPages:locked',
    category: 'userPages',
    labelKey: 'locked_folder',
    descriptionKey: 'cmdk_nav_locked_description',
    icon: mdiLockOutline,
    route: Route.locked(),
    adminOnly: false,
  },
  {
    id: 'nav:userPages:duplicates',
    category: 'userPages',
    labelKey: 'review_duplicates',
    descriptionKey: 'cmdk_nav_duplicates_description',
    icon: mdiContentDuplicate,
    route: Route.duplicatesUtility(),
    adminOnly: true,
  },
  {
    id: 'nav:userPages:utilities',
    category: 'userPages',
    labelKey: 'utilities',
    descriptionKey: 'cmdk_nav_utilities_description',
    icon: mdiToolboxOutline,
    route: Route.utilities(),
    adminOnly: true,
  },
  {
    id: 'nav:userPages:import',
    category: 'userPages',
    labelKey: 'import',
    descriptionKey: 'cmdk_nav_import_description',
    icon: mdiDatabaseImportOutline,
    route: Route.import(),
    adminOnly: true,
  },
  {
    id: 'nav:userPages:recently_added',
    category: 'userPages',
    labelKey: 'recently_added',
    descriptionKey: 'cmdk_nav_recently_added_description',
    icon: mdiUploadOutline,
    route: Route.recentlyAdded(),
    adminOnly: false,
  },
  {
    id: 'nav:userPages:folders',
    category: 'userPages',
    labelKey: 'folders',
    descriptionKey: 'cmdk_nav_folders_description',
    icon: mdiFolderOutline,
    route: Route.folders(),
    adminOnly: false,
  },
  {
    id: 'nav:userPages:shared_links',
    category: 'userPages',
    labelKey: 'shared_links',
    descriptionKey: 'cmdk_nav_shared_links_description',
    icon: mdiLinkVariant,
    route: Route.sharedLinks(),
    adminOnly: false,
  },
];

export const NAVIGATION_ITEMS: readonly NavigationItem[] = [...SYSTEM_SETTINGS, ...ADMIN_PAGES, ...USER_PAGES];

const MIN_MATCH_LENGTH = 3;

/**
 * "Almost exact" match — used to promote a navigation item to the palette's
 * "Top result" band above photos/places/etc. when the query unambiguously
 * points at its label.
 *
 * See {@link isAlmostExactWordMatch} for the rule. The 3-char floor keeps
 * single keystrokes from promoting the first match in the catalog, while
 * working at word granularity lets compound queries like `auto-classification`
 * still promote `Classification Settings` on their second token.
 */
export function isAlmostExactNavMatch(query: string, label: string): boolean {
  return isAlmostExactWordMatch(query, label, MIN_MATCH_LENGTH);
}
