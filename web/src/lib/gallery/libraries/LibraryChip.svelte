<script lang="ts">
  import { t } from 'svelte-i18n';
  import { chipLibrary } from './library-words';

  // Local Omarchy layer: the open library's name in its colour, beside the mark (the one bar, and the admin shell's
  // bar). It takes what the bar's first column leaves after the mark and never more, so the bar keeps its shape at every
  // width and scroll: a narrow column keeps the colour alone, and a phone, whose bar gives that room to the page's name
  // as it gives the mark's, none.
  const library = $derived(chipLibrary());
  const label = $derived(library ? $t('libraries_open_here', { values: { name: library.name } }) : '');
</script>

{#if library}
  <span class="ws-library-chip-room" data-testid="library-chip">
    <span class="ws-library-chip" style:--ws-library={library.colour} title={label}>
      <span class="ws-library-chip-swatch" aria-hidden="true"></span>
      <span class="sr-only">{label}</span>
      <span class="ws-library-chip-name" aria-hidden="true">{library.name}</span>
    </span>
  </span>
{/if}

<style>
  /* the room left in the bar's first column, measured as a container, so the chip's steps follow the room it has */
  .ws-library-chip-room {
    container-type: inline-size;
    display: flex;
    flex: 1 1 0;
    align-items: center;
    min-width: 0;
    padding-inline: 0.25rem 0.5rem;
  }
  /* one frame in the library's colour on a tint of it, the name in the theme's ink, which every theme keeps legible */
  .ws-library-chip {
    display: inline-flex;
    gap: 0.375rem;
    align-items: center;
    max-width: 100%;
    padding: 0.125rem 0.375rem;
    border: 1px solid var(--ws-library);
    border-radius: var(--ws-radius);
    background: color-mix(in oklab, var(--ws-library) 14%, var(--immich-ui-light));
    color: var(--immich-ui-dark);
    font-size: var(--ws-text-meta);
    font-weight: 600;
    line-height: 1.25;
    white-space: nowrap;
  }
  .ws-library-chip-swatch {
    flex: none;
    width: 0.5rem;
    height: 0.5rem;
    background: var(--ws-library);
  }
  .ws-library-chip-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  @container (max-width: 4.5rem) {
    .ws-library-chip-name {
      display: none;
    }
  }
  @container (max-width: 1.375rem) {
    .ws-library-chip {
      display: none;
    }
  }
  @media (max-width: 639px) {
    .ws-library-chip-room {
      display: none;
    }
  }
</style>
