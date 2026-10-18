export type ManagedPerson = {
  id: string;
  displayName: string;
  canonicalName?: string;
  thumbnailUrl: string;
  href: string;
  isHidden: boolean;
  isFavorite?: boolean;
  type?: string;
  species?: string | null;
  assetCount?: number;
  faceCount?: number;
  canEditPersonalProfile?: boolean;
  /** Local Omarchy layer: the tile's name for a screen reader when the name alone does not say who (a repeated name) */
  accessibleName?: string;
};

export type VisibilityPerson = Pick<
  ManagedPerson,
  'id' | 'displayName' | 'thumbnailUrl' | 'isHidden' | 'type' | 'species'
>;

export type VisibilityChange = {
  id: string;
  isHidden: boolean;
};

export type VisibilitySaveResult = {
  successCount: number;
  failCount: number;
  /** Local Omarchy layer: the undo history entry that takes the changes back, for the toast's Undo */
  undo?: number;
};
