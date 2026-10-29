<script lang="ts">
  // Local Omarchy layer: Move to…, for the selection: one registration line in each photo menu and selection ⋮
  // (Photos, an album, a person's page), and one row here for each place a move can go: each other library of
  // Kioku's, in the context's order (MoveDialog). A photo vault's row (Move to vault) joins this list, after the
  // libraries', so each menu keeps its one line. A row shows only where a move can start: the page conditions
  // (move-gates), and a selection with photos of the owner's own and none in the trash. On a person's page the move
  // names that person too, so the destination can say where its face recognition put them.
  import { page } from '$app/state';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import type { Library } from '$lib/gallery/libraries/library-file';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import type { PersonResponseDto } from '@immich/sdk';
  import { Button, modalManager } from '@immich/ui';
  import { mdiImageMove } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import MoveDialog from './MoveDialog.svelte';
  import { canMoveFrom, isOwnPerson, movePerson, moveTargets, type MoveSelection } from './move-gates';

  type Props = {
    menuItem?: boolean;
    /** the person whose page this is: the move names them */
    person?: PersonResponseDto;
  };

  let { menuItem = false, person }: Props = $props();

  let userAgent = $state('');
  onMount(() => {
    userAgent = navigator.userAgent;
  });

  const owner = $derived(authManager.authenticated && !authManager.isSharedLink ? authManager.user : undefined);
  const selection = $derived(canMoveFrom(page.url, userAgent, owner, assetMultiSelectManager.assets));
  const targets = $derived(selection ? moveTargets() : []);

  // the selection as the row was drawn, since a right-click menu closes before its row's action runs
  const move = (destination: Library, chosen: MoveSelection) => () => {
    void modalManager.show(MoveDialog, {
      request: {
        kind: 'selection',
        ids: chosen.ids,
        notOwned: chosen.notOwned,
        ...(person && isOwnPerson(person) && { person: movePerson(person) }),
      },
      destination,
    });
  };
</script>

{#if selection}
  {#each targets as destination (destination.id)}
    {#if menuItem}
      <MenuOption
        icon={mdiImageMove}
        text={$t('moves_move_to', { values: { library: destination.name } })}
        onClick={move(destination, selection)}
        testId="move-to-library"
      />
    {:else}
      <Button
        leadingIcon={mdiImageMove}
        size="medium"
        color="secondary"
        variant="ghost"
        onclick={move(destination, selection)}
      >
        {$t('moves_move_to', { values: { library: destination.name } })}
      </Button>
    {/if}
  {/each}
{/if}
