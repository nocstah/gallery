<script lang="ts">
  // A stand-in for MemoryFilm in the series' specs: it keeps what it was given in `seen`, and its one button closes it.
  import { seen } from './memory-film.test-seen';

  let { ...props }: Record<string, unknown> = $props();

  $effect.pre(() => {
    seen.props = props;
  });
</script>

<section data-testid="memory-film" data-memory={(props.memory as { id: string }).id}>
  <button
    type="button"
    aria-label="memory-film-close"
    data-testid="memory-film-close"
    onclick={() => (props.onClose as () => void)()}
  ></button>
</section>
