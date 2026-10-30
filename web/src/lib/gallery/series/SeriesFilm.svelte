<script lang="ts">
  // Local Omarchy layer: Play in Coming up (gallery/series): a memory's film as the family will see it, the film Kioku
  // plays (MemoryFilm) full screen over the shell, with the owner's own media: Gallery's previews with the session, and
  // Curator's songs. Its title card and its words are the memory's title and line; Curator has its cover and the faces,
  // so nothing is waited for.
  import type { AssetResponseDto } from '@immich/sdk';
  import MemoryFilm from '$lib/components/memories/film/MemoryFilm.svelte';
  import { privateFilmMedia } from '$lib/components/memories/film/private-film-media';
  import Portal from '$lib/elements/Portal.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { mediaQueryManager } from '$lib/stores/media-query-manager.svelte';
  import { locale } from '$lib/stores/preferences.store';
  import type { ComingMemory } from './series-api';

  type Props = {
    memory: ComingMemory;
    /** its photos and clips as Gallery gives them, in film order */
    assets: AssetResponseDto[];
    onClose: () => void;
  };

  let { memory, assets, onClose }: Props = $props();
</script>

<Portal>
  <MemoryFilm
    media={privateFilmMedia}
    language={$locale}
    reducedMotion={mediaQueryManager.reducedMotion}
    memory={{ id: `series:${memory.key}`, assets }}
    assetId={assets[0].id}
    active
    name={memory.title}
    line={memory.line}
    title={memory.title}
    cover={memory.cover}
    focus={memory.focus}
    settled
    story={null}
    tracks={memory.tracks}
    photoSeconds={authManager.preferences.memories.duration}
    {onClose}
  />
</Portal>
