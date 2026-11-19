import { updatePersonName, updatePersonVisibility } from '#lib/gallery/people/person.service.ts';
import { authManager } from '#lib/managers/auth-manager.svelte.ts';
import { eventManager } from '#lib/managers/event-manager.svelte.ts';
import { undoManager } from '#lib/managers/undo-manager.svelte.ts';
import PersonEditBirthDateModal from '#lib/modals/PersonEditBirthDateModal.svelte';
import { getSpaceProfile } from '#lib/utils/global-person-route.ts';
import { handleError } from '#lib/utils/handle-error.ts';
import { getFormatter } from '#lib/utils/i18n.ts';
import { toastUndoable, undone } from '#lib/utils/undoable.ts';
import {
  PersonUpdateStrategy,
  getPerson,
  updatePeople,
  updatePerson,
  type AssetResponseDto,
  type PersonResponseDto,
  type PersonUpdateDto,
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
    shortcuts: { key: 'f' },
  };

  const Unfavorite: ActionItem = {
    title: $t('unfavorite'),
    icon: mdiHeartMinusOutline,
    $if: () => !getSpaceProfile(person) && !!person.isFavorite,
    onAction: () => handleUnfavoritePerson(person),
    shortcuts: { key: 'f' },
  };

  const HidePerson: ActionItem = {
    title: $t('hide_person'),
    icon: mdiEyeOffOutline,
    $if: () => !person.isHidden && canWrite(),
    onAction: () => handleHidePerson(person),
    shortcuts: { key: 'h' },
  };

  const ShowPerson: ActionItem = {
    title: $t('unhide_person'),
    icon: mdiEyeOutline,
    $if: () => !!person.isHidden && canWrite(),
    onAction: () => handleShowPerson(person),
    shortcuts: { key: 'h' },
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

/**
Many hidden and shown at once (Show & hide people): undone by setting each the other way round. `people` are
those the page held, for telling the open pages. Returns the entry, for the toast's Undo.
*/
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

export const handleUpdatePerson = async ({ id, ...personUpdateDto }: { id: string } & PersonUpdateDto) => {
  const $t = await getFormatter();

  try {
    const response = await updatePerson({ id, personUpdateDto });
    const isOtherUser = !!personUpdateDto.userId && personUpdateDto.userId !== authManager.user.id;
    eventManager.emit('PersonUpdate', isOtherUser ? await getPerson({ id }) : response);
    return response;
  } catch (error) {
    handleError(error, $t('errors.something_went_wrong'));
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

export const withUpdateStrategy = (dto: PersonUpdateDto): PersonUpdateDto =>
  authManager.preferences.people?.updateStrategy === PersonUpdateStrategy.Self
    ? { ...dto, userId: authManager.user.id }
    : dto;

export const handleUpdatePersonName = async (
  { id, name }: { id: string; name: string },
  options?: { notify: boolean },
) => {
  const response = await handleUpdatePerson({ id, ...withUpdateStrategy({ name }) });
  if (response && options?.notify) {
    const $t = await getFormatter();
    toastManager.primary($t('change_name_successfully'));
  }

  return response;
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
