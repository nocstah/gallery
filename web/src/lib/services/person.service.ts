import {
  getPersonFaces,
  getSpacePersonFaces,
  SharedSpaceRole,
  updatePeople,
  updatePerson,
  updateRepresentativeFace,
  updateSpacePerson,
  updateSpacePersonRepresentativeFace,
  type AssetResponseDto,
  type PersonFacePageResponseDto,
  type PersonResponseDto,
  type SharedSpaceResponseDto,
} from '@immich/sdk';
import { modalManager, toastManager, type ActionItem } from '@immich/ui';
import {
  mdiCalendarEditOutline,
  mdiEyeOffOutline,
  mdiEyeOutline,
  mdiFaceManProfile,
  mdiHeartMinusOutline,
  mdiHeartOutline,
} from '@mdi/js';
import type { MessageFormatter } from 'svelte-i18n';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { undoManager } from '$lib/managers/undo-manager.svelte';
import PersonEditBirthDateModal from '$lib/modals/PersonEditBirthDateModal.svelte';
import { getSpaceProfile } from '$lib/utils/global-person-route';
import { handleError } from '$lib/utils/handle-error';
import { getFormatter } from '$lib/utils/i18n';
import { getPersonFaceThumbnailUrl, getSpacePersonFaceThumbnailUrl } from '$lib/utils/people-utils';
import { toastUndoable, undone } from '$lib/utils/undoable';

// The role is the viewer's own row in the spaces list (`getAllSpaces` embeds `members`, see
// loadSpaces). The server enforces the role on every write, so this fails open: while the list is
// unknown (loading or failed), or when it lacks the space (joined since it was cached), the actions
// stay offered rather than hidden from an editor.
export const isSpaceEditor = (spaces: SharedSpaceResponseDto[] | undefined, spaceId: string, userId: string) => {
  const space = spaces?.find(({ id }) => id === spaceId);
  if (!space) {
    return true;
  }
  const role = space.members?.find((member) => member.userId === userId)?.role;
  return role === SharedSpaceRole.Owner || role === SharedSpaceRole.Editor;
};

export const getPersonActions = (
  $t: MessageFormatter,
  person: PersonResponseDto,
  { canEditSpacePerson = true }: { canEditSpacePerson?: boolean } = {},
) => {
  const canWrite = () => !getSpaceProfile(person) || canEditSpacePerson;

  const SetDateOfBirth: ActionItem = {
    title: $t('set_date_of_birth'),
    icon: mdiCalendarEditOutline,
    $if: canWrite,
    onAction: () => modalManager.show(PersonEditBirthDateModal, { person }),
  };

  // Shared space people have no favorite state, so don't offer it for them.
  const Favorite: ActionItem = {
    title: $t('to_favorite'),
    icon: mdiHeartOutline,
    $if: () => !getSpaceProfile(person) && !person.isFavorite,
    onAction: () => handleFavoritePerson(person),
  };

  const Unfavorite: ActionItem = {
    title: $t('unfavorite'),
    icon: mdiHeartMinusOutline,
    $if: () => !getSpaceProfile(person) && !!person.isFavorite,
    onAction: () => handleUnfavoritePerson(person),
  };

  const HidePerson: ActionItem = {
    title: $t('hide_person'),
    icon: mdiEyeOffOutline,
    $if: () => !person.isHidden && canWrite(),
    onAction: () => handleHidePerson(person),
  };

  const ShowPerson: ActionItem = {
    title: $t('unhide_person'),
    icon: mdiEyeOutline,
    $if: () => !!person.isHidden && canWrite(),
    onAction: () => handleShowPerson(person),
  };

  return { SetDateOfBirth, Favorite, Unfavorite, HidePerson, ShowPerson };
};

export const getPersonAssetActions = ($t: MessageFormatter, person: PersonResponseDto, asset: AssetResponseDto) => {
  const SetFeaturedPhoto: ActionItem = {
    title: $t('set_as_featured_photo'),
    icon: mdiFaceManProfile,
    onAction: () => handleSetFeaturedPhoto(person, asset.id),
  };

  return { SetFeaturedPhoto };
};

const handleFavoritePerson = async (person: { id: string }) => {
  const $t = await getFormatter();

  try {
    const response = await updatePerson({ id: person.id, personUpdateDto: { isFavorite: true } });
    eventManager.emit('PersonUpdate', response);
    toastManager.primary($t('added_to_favorites'));
  } catch (error) {
    handleError(error, $t('errors.unable_to_add_remove_favorites', { values: { favorite: false } }));
  }
};

const handleUnfavoritePerson = async (person: { id: string }) => {
  const $t = await getFormatter();

  try {
    const response = await updatePerson({ id: person.id, personUpdateDto: { isFavorite: false } });
    eventManager.emit('PersonUpdate', response);
    toastManager.primary($t('removed_from_favorites'));
  } catch (error) {
    handleError(error, $t('errors.unable_to_add_remove_favorites', { values: { favorite: false } }));
  }
};

const updatePersonVisibility = async (person: PersonResponseDto, isHidden: boolean): Promise<PersonResponseDto> => {
  const profile = getSpaceProfile(person);
  if (profile) {
    const updated = await updateSpacePerson({
      id: profile.spaceId,
      personId: profile.id,
      sharedSpacePersonUpdateDto: { isHidden },
    });
    return { ...person, isHidden: updated.isHidden };
  }
  return updatePerson({ id: person.id, personUpdateDto: { isHidden } });
};

// Local Omarchy layer: hiding, showing and renaming someone can be taken back, from its toast's Undo or from the bar's
// undo history (managers/undo-manager), the way utils/undoable does it for photos; PersonUpdate tells the open pages

/** Someone hidden or shown: undone by setting them the other way round. */
const visibilityDone = ($t: MessageFormatter, person: PersonResponseDto) => {
  const label = `${$t(person.isHidden ? 'hide_person' : 'unhide_person')} · ${person.name || $t('unknown')}`;
  const entry = undoManager.record(
    label,
    async () => {
      const response = await updatePersonVisibility(person, !person.isHidden);
      eventManager.emit('PersonUpdate', response);
      return undone(label);
    },
    $t(person.isHidden ? 'errors.something_went_wrong' : 'errors.unable_to_hide_person'),
  );
  toastUndoable($t('changed_visibility_successfully'), entry);
};

/** A new name (or none): undone by giving back the old one. Shows the rename's toast, with the Undo. */
export const nameChangedDone = ($t: MessageFormatter, person: PersonResponseDto, before: string) => {
  const label = `${$t('change_name')} · ${before || $t('unknown')} → ${person.name || $t('unknown')}`;
  const entry = undoManager.record(
    label,
    async () => {
      const response = await updatePersonName(person, before);
      eventManager.emit('PersonUpdate', response);
      return undone(label);
    },
    $t('errors.unable_to_save_name'),
  );
  toastUndoable($t('change_name_successfully'), entry);
};

/** Many hidden and shown at once (Show & hide people): undone by setting each the other way round. `people` are
 * those the page held, for telling the open pages. Returns the entry, for the toast's Undo. */
export const visibilitiesDone = (
  $t: MessageFormatter,
  changes: { id: string; isHidden: boolean }[],
  people: PersonResponseDto[],
) => {
  if (changes.length === 0) {
    return;
  }
  const count = changes.length;
  const label = $t('visibility_changed', { values: { count } });
  return undoManager.record(
    label,
    async () => {
      const back = changes.map(({ id, isHidden }) => ({ id, isHidden: !isHidden }));
      const results = await updatePeople({ peopleUpdateDto: { people: back } });
      const done = new Set(results.filter(({ success }) => success).map(({ id }) => id));
      const failed = results.length - done.size;
      const byId = new Map(people.map((person) => [person.id, person]));
      for (const { id, isHidden } of back) {
        const person = byId.get(id);
        if (person && done.has(id)) {
          eventManager.emit('PersonUpdate', { ...person, isHidden });
        }
      }
      // the entry stays, to try again: setting the rest once more changes nothing
      if (failed > 0) {
        throw new Error($t('errors.unable_to_change_visibility', { values: { count: failed } }));
      }
      return undone(label);
    },
    $t('errors.unable_to_change_visibility', { values: { count } }),
  );
};

const handleHidePerson = async (person: PersonResponseDto) => {
  const $t = await getFormatter();

  try {
    const response = await updatePersonVisibility(person, true);
    visibilityDone($t, response);
    eventManager.emit('PersonUpdate', response);
  } catch (error) {
    handleError(error, $t('errors.unable_to_hide_person'));
  }
};

const handleShowPerson = async (person: PersonResponseDto) => {
  const $t = await getFormatter();

  try {
    const response = await updatePersonVisibility(person, false);
    visibilityDone($t, response);
    eventManager.emit('PersonUpdate', response);
  } catch (error) {
    handleError(error, $t('errors.something_went_wrong'));
  }
};

export const getPersonFacesPage = (
  person: PersonResponseDto,
  { page, size }: { page: number; size: number },
): Promise<PersonFacePageResponseDto> => {
  const profile = getSpaceProfile(person);
  return profile
    ? getSpacePersonFaces({ id: profile.spaceId, personId: profile.id, page, size })
    : getPersonFaces({ id: person.id, page, size });
};

export const updatePersonRepresentativeFace = async (
  person: PersonResponseDto,
  assetFaceId: string,
): Promise<PersonResponseDto> => {
  const profile = getSpaceProfile(person);
  if (profile) {
    const updated = await updateSpacePersonRepresentativeFace({
      id: profile.spaceId,
      personId: profile.id,
      spaceRepresentativeFaceUpdateDto: { assetFaceId },
    });
    return { ...person, updatedAt: updated.updatedAt };
  }
  return updateRepresentativeFace({ id: person.id, representativeFaceUpdateDto: { assetFaceId } });
};

export const getPersonFaceThumbnail = (person: PersonResponseDto, faceId: string): string => {
  const profile = getSpaceProfile(person);
  return profile
    ? getSpacePersonFaceThumbnailUrl(profile.spaceId, profile.id, faceId, person.updatedAt)
    : getPersonFaceThumbnailUrl(person.id, faceId, person.updatedAt);
};

export const updatePersonName = async (person: PersonResponseDto, name: string): Promise<PersonResponseDto> => {
  const profile = getSpaceProfile(person);
  if (profile) {
    const updated = await updateSpacePerson({
      id: profile.spaceId,
      personId: profile.id,
      sharedSpacePersonUpdateDto: { name },
    });
    return {
      ...person,
      name: updated.name,
      birthDate: updated.birthDate ?? person.birthDate,
      isHidden: updated.isHidden,
      updatedAt: updated.updatedAt,
      type: updated.type ?? person.type,
      numberOfAssets: updated.assetCount,
    };
  }
  return updatePerson({ id: person.id, personUpdateDto: { name } });
};

export const handleUpdatePersonBirthDate = async (person: PersonResponseDto, birthDate: string | null) => {
  const $t = await getFormatter();

  try {
    const profile = getSpaceProfile(person);
    let response: PersonResponseDto;
    if (profile) {
      const updated = await updateSpacePerson({
        id: profile.spaceId,
        personId: profile.id,
        sharedSpacePersonUpdateDto: { birthDate },
      });
      response = { ...person, birthDate: updated.birthDate ?? null };
    } else {
      response = await updatePerson({ id: person.id, personUpdateDto: { birthDate } });
    }
    toastManager.primary($t('date_of_birth_saved'));
    eventManager.emit('PersonUpdate', response);
    return true;
  } catch (error) {
    handleError(error, $t('errors.unable_to_save_date_of_birth'));
  }
};

const handleSetFeaturedPhoto = async (person: PersonResponseDto, featureFaceAssetId: string) => {
  const $t = await getFormatter();

  try {
    const response = await updatePerson({ id: person.id, personUpdateDto: { featureFaceAssetId } });
    toastManager.primary($t('feature_photo_updated'));
    eventManager.emit('PersonUpdate', response);
  } catch (error) {
    handleError(error, $t('errors.unable_to_set_feature_photo'));
  }
};
