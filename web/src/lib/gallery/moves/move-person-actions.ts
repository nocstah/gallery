// Local Omarchy layer: the person's own ⋮ on their page (gallery/moves): Move this person's photos to <library>, one
// row for each other library, with nothing selected. The move takes what the person's page shows, their photos and
// videos on this library's timeline that are the owner's own, and their archived ones only when the dialog's tick
// asks for them; the mover lists them itself. Offered where a move can start (move-gates), for a person who is the
// owner's own and not a grouped one.
import type { PersonResponseDto } from '@immich/sdk';
import { modalManager, type ActionItem } from '@immich/ui';
import { mdiImageMove } from '@mdi/js';
import type { MessageFormatter } from 'svelte-i18n';
import { page } from '$app/state';
import { authManager } from '$lib/managers/auth-manager.svelte';
import MoveDialog from './MoveDialog.svelte';
import { canMovePerson, movePerson, moveTargets } from './move-gates';

export const getMovePersonActions = ($t: MessageFormatter, person: PersonResponseDto): ActionItem[] => {
  const owner = authManager.authenticated && !authManager.isSharedLink ? authManager.user : undefined;
  if (!canMovePerson(page.url, navigator.userAgent, owner, person)) {
    return [];
  }
  return moveTargets().map((destination) => ({
    title: $t('moves_move_person_to', { values: { library: destination.name } }),
    icon: mdiImageMove,
    onAction: () =>
      void modalManager.show(MoveDialog, { request: { kind: 'person', person: movePerson(person) }, destination }),
  }));
};
