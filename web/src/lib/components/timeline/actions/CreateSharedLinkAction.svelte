<script lang="ts">
  import { shareSelection } from '$lib/services/asset.service';
  import { IconButton } from '@immich/ui';
  import { mdiShareVariantOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  type Props = {
    /**
     * #1018: set on a space surface where the caller is an Owner/Editor. The link is then
     * authorized against the space rather than against asset ownership, so the WHOLE selection
     * goes in — including photos other members contributed. Undefined everywhere else, which
     * keeps the owned-subset narrowing (shareSelection).
     */
    spaceId?: string;
    /** Local Omarchy layer: the Space whose page this is; the Share sheet does not offer to add the photos to it. */
    fromSpaceId?: string;
  };

  let { spaceId, fromSpaceId }: Props = $props();

  // Local Omarchy layer: the Share sheet for photos (modals/SelectionShareModal) with the bulk Share's own guards: an
  // unauthenticated viewer gets nothing, a selection with nothing of mine a toast, and the link takes the owned subset
  // unless the space scopes it
  const handleClick = () => shareSelection($t, { shareSpaceId: spaceId, fromSpaceId });
</script>

<IconButton
  shape="round"
  color="secondary"
  variant="ghost"
  aria-label={$t('share')}
  icon={mdiShareVariantOutline}
  onclick={handleClick}
/>
