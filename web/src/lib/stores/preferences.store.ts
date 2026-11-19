import { defaultLang } from '#lib/constants.ts';
import { convertBCP47, getPreferredLocale } from '#lib/utils/i18n.ts';
import { persisted } from 'svelte-persisted-store';
import { browser } from '$app/env';

// Locale to use for formatting dates, numbers, etc.
export const locale = persisted('locale', 'default', {
  serializer: {
    parse: (text) => convertBCP47(text) || 'default',
    stringify: (object = '') => object,
  },
});

const preferredLocale = browser ? getPreferredLocale() : undefined;
export const lang = persisted<string>('lang', preferredLocale || defaultLang.code, {
  serializer: {
    parse: (text) => convertBCP47(text),
    stringify: (object = '') => object,
  },
});

export interface MapSettings {
  allowDarkMode: boolean;
  includeArchived: boolean;
  onlyFavorites: boolean;
  withPartners: boolean;
  withSharedAlbums: boolean;
  showAssetPanel: boolean;
  relativeDate: string;
  dateAfter?: string;
  dateBefore?: string;
}

const defaultMapSettings = {
  allowDarkMode: true,
  includeArchived: false,
  onlyFavorites: false,
  withPartners: false,
  withSharedAlbums: false,
  showAssetPanel: false,
  relativeDate: '',
};

const persistedObject = <T>(key: string, defaults: T) =>
  persisted<T>(key, defaults, {
    serializer: {
      parse: (text) => ({ ...defaults, ...JSON.parse(text ?? null) }),
      stringify: JSON.stringify,
    },
  });

export const mapSettings = persistedObject<MapSettings>('map-settings', defaultMapSettings);

export interface AlbumViewSettings {
  view: string;
  filter: string;
  groupBy: string;
  groupOrder: string;
  sortBy: string;
  sortOrder: string;
  collapsedGroups: {
    // Grouping Option => Array<Group ID>
    [group: string]: string[];
  };
}

export interface PlacesViewSettings {
  groupBy: string;
  collapsedGroups: {
    // Grouping Option => Array<Group ID>
    [group: string]: string[];
  };
}

export enum SortOrder {
  Asc = 'asc',
  Desc = 'desc',
}

export enum AlbumViewMode {
  Cover = 'Cover',
  List = 'List',
}

export enum AlbumFilter {
  All = 'All',
  Owned = 'Owned',
  Shared = 'Shared',
}

export enum AlbumGroupBy {
  None = 'None',
  Year = 'Year',
  Owner = 'Owner',
}

export enum AlbumSortBy {
  Title = 'Title',
  ItemCount = 'ItemCount',
  DateModified = 'DateModified',
  DateCreated = 'DateCreated',
  MostRecentPhoto = 'MostRecentPhoto',
  OldestPhoto = 'OldestPhoto',
}

export const albumViewSettings = persisted<AlbumViewSettings>('album-view-settings', {
  view: AlbumViewMode.Cover,
  filter: AlbumFilter.All,
  groupBy: AlbumGroupBy.Year,
  groupOrder: SortOrder.Desc,
  sortBy: AlbumSortBy.MostRecentPhoto,
  sortOrder: SortOrder.Desc,
  collapsedGroups: {},
});

export enum PlacesGroupBy {
  None = 'None',
  Country = 'Country',
}

export const placesViewSettings = persisted<PlacesViewSettings>('places-view-settings', {
  groupBy: PlacesGroupBy.None,
  collapsedGroups: {},
});

export const showDeleteModal = persisted<boolean>('delete-confirm-dialog', true, {});

export const alwaysLoadOriginalFile = persisted<boolean>('always-load-original-file', false, {});

export const playVideoThumbnailOnHover = persisted<boolean>('play-video-thumbnail-on-hover', true, {});

export const loopVideo = persisted<boolean>('loop-video', true, {});

export const autoPlayVideo = persisted<boolean>('auto-play-video', true, {});

export const alwaysLoadOriginalVideo = persisted<boolean>('always-load-original-video', false, {});

/**
Local Omarchy layer: whether a search on Photos shows archived photos too (its "Include archived" box). Off by
default: a search finds what Photos shows, not what was put away (the archive, To do, Villa).
*/
export const searchIncludeArchived = persisted<boolean>('omarchy-search-include-archived', false, {});

/**
Local Omarchy layer: Utilities › Bank slips' rule, which amounts ("any amount below 3000 delete it or move it to QR or
any amount between 50,000 and 80,000 move it to QR or delete it"). Each range keeps its own numbers; what to do with
them is not kept, so the page always opens on Move to QR.
*/
export type SlipsRule = {
  mode: 'any' | 'under' | 'over' | 'between';
  under: number | null;
  over: number | null;
  from: number | null;
  to: number | null;
};

export const slipsRule = persisted<SlipsRule>(
  'omarchy-slips-rule',
  { mode: 'under', under: 3000, over: 50_000, from: 50_000, to: 80_000 },
  {},
);

export const recentAlbumsDropdown = persisted<boolean>('recent-albums-open', true, {});

export const hideBackupsReminder = persisted<boolean>('hide-backups-reminder', false, {});

/**
Local Omarchy layer: the folders a person opened or closed in the sidebar's album trees, keyed `<tree>:<folder id>`.
The folders opened to reveal what is on screen are not kept here (components/sidebar/album-tree); a new key, since
the old one ('album-tree-open') held those too, and every page carried them open.
*/
export const albumTreeOpen = persisted<Record<string, boolean>>('album-tree-opened', {}, {});

/**
Local Omarchy layer: the sidebar's groups folded away under their heading (Manage, Hidden and deleted), by name;
a group not named here is open (components/sidebar/sidebar-nav-group).
*/
export const sidebarGroupsClosed = persisted<Record<string, boolean>>('sidebar-groups-closed', {}, {});
