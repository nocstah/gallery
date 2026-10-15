<script lang="ts">
  // Local Omarchy layer: Adjust, Filters and Straighten, Apple Photos' editing, in the photo viewer (Curator's
  // live.adjust, ~/code/curator/curator/adjust.py). The photo's preview is adjusted live on the GPU (adjust-gl.ts) with
  // the same math Curator renders the full-size photo with (adjust-math.ts), so what is seen is what is kept. Keep sends
  // the settings; Curator renders the new version and proposes it, and the panel accepts that at once (Keep was the
  // yes): the new version goes on top of the photo's stack, the original untouched, with an Undo in the toast and the
  // bar (Curator's own undo of it). Closed while Curator renders, the new version waits in the AI inbox.
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { undoManager } from '$lib/managers/undo-manager.svelte';
  import { getAssetMediaUrl } from '$lib/utils';
  import { refreshAssets } from '$lib/utils/asset-refresh';
  import { curator, type JobRow } from '$lib/utils/curator';
  import { toastUndoable } from '$lib/utils/undoable';
  import { AssetMediaSize, getAssetInfo, getStack, type AssetResponseDto } from '@immich/sdk';
  import { Icon, modalManager } from '@immich/ui';
  import { mdiClose, mdiTuneVariant } from '@mdi/js';
  import { onDestroy, onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { AdjustPreview } from './adjust-gl';
  import {
    changes,
    colour,
    effective,
    FILTERS,
    lutData,
    neutral,
    SLIDERS,
    sourceMatrix,
    VIGNETTE,
    type AdjustSettings,
    type FilterName,
    type Slider,
  } from './adjust-math';

  interface Props {
    asset: AssetResponseDto;
    onClose: () => void;
    /** the new version once kept, for the viewer to show */
    onKept?: (version: AssetResponseDto) => void;
  }

  let { asset, onClose, onKept }: Props = $props();

  type Tab = 'adjust' | 'filters' | 'straighten';

  const LIGHT: Slider[] = ['exposure', 'brilliance', 'highlights', 'shadows', 'contrast', 'brightness', 'black_point'];
  const COLOR: Slider[] = ['saturation', 'vibrance', 'warmth', 'tint'];
  // the colour table's points a side: coarse while a slider moves (built in about 7 ms), finer once it rests
  const POINTS = { moving: 33, resting: 49 };
  const REST_MS = 200;
  const POLL_MS = 600;
  // the version is shown once Gallery has drawn its thumbnails; until then the preview, which looks the same, stays
  const DRAWN_MS = 15_000;
  // the filters' thumbnails: a square from the middle of the photo
  const THUMB = 128;
  const CHOICES = ['none', ...FILTERS] as const;

  let tab = $state<Tab>('adjust');
  let settings = $state<AdjustSettings>(neutral());
  let saving = $state(false);
  let message = $state<string>();
  let original = $state(false);
  // the live preview: WebGL draws it once the photo is in; 'off' shows the photo as it is, for browsers without WebGL2
  let live = $state<'loading' | 'ready' | 'off'>('loading');
  let broken = $state(false);
  let ratio = $state(4 / 3);
  let canvas = $state<HTMLCanvasElement>();
  let frameElement = $state<HTMLDivElement>();
  let thumbs = $state<Partial<Record<FilterName | 'none', HTMLCanvasElement>>>({});
  let job = $state<number>();
  let confirming = false;
  let gone = false;
  let preview: AdjustPreview | undefined;
  let source: HTMLCanvasElement | undefined;
  let small: ImageData | undefined;

  const src = $derived(getAssetMediaUrl({ id: asset.id, size: AssetMediaSize.Preview, cacheKey: asset.thumbhash }));
  const dirty = $derived(changes(settings));
  // each filter's name in the panel (Apple's), keyed by the filter Curator knows
  const FILTER_KEYS = {
    none: 'adjust_filter_original',
    vivid: 'adjust_filter_vivid',
    'vivid-warm': 'adjust_filter_vivid_warm',
    'vivid-cool': 'adjust_filter_vivid_cool',
    dramatic: 'adjust_filter_dramatic',
    'dramatic-warm': 'adjust_filter_dramatic_warm',
    'dramatic-cool': 'adjust_filter_dramatic_cool',
    mono: 'adjust_filter_mono',
    silvertone: 'adjust_filter_silvertone',
    noir: 'adjust_filter_noir',
  } as const;

  // ---- the preview ----

  /** everything the colour table depends on: the vignette and the angle are drawn on top of it */
  const tableKey = (value: AdjustSettings) =>
    JSON.stringify([
      ...SLIDERS.filter((key) => key !== 'vignette').map((key) => value[key]),
      value.filter,
      value.intensity,
    ]);

  let built = '';
  let builtPoints = 0;
  let frameRequest = 0;
  let resting: ReturnType<typeof setTimeout> | undefined;

  const draw = () => {
    if (!preview || !source) {
      return;
    }
    preview.draw({
      frame: sourceMatrix(settings.angle, source.width, source.height),
      vignette: VIGNETTE * settings.vignette,
      original,
    });
  };

  const build = (points: number) => {
    preview?.table(lutData(effective(settings), points), points);
    built = tableKey(settings);
    builtPoints = points;
  };

  /** at most once a frame: a new table when the colours changed, then the frame */
  const paint = () => {
    frameRequest = 0;
    if (live !== 'ready') {
      return;
    }
    if (tableKey(settings) !== built) {
      build(POINTS.moving);
      clearTimeout(resting);
      resting = setTimeout(() => {
        if (!gone && builtPoints < POINTS.resting && tableKey(settings) === built) {
          build(POINTS.resting);
          draw();
        }
      }, REST_MS);
    }
    draw();
  };

  $effect(() => {
    // what the frame shows: every setting, and the original while it is held
    void tableKey(settings);
    void settings.angle;
    void settings.vignette;
    void original;
    if (live === 'ready' && !frameRequest) {
      frameRequest = requestAnimationFrame(paint);
    }
  });

  /** the canvas at the frame's size in device pixels */
  const fit = () => {
    if (!canvas || !frameElement) {
      return;
    }
    const { width, height } = frameElement.getBoundingClientRect();
    const scale = Math.min(globalThis.devicePixelRatio || 1, 3);
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    draw();
  };

  /** the preview in sRGB, drawn into a canvas: a Display P3 photo comes out as Curator converts the full-size one */
  const inSrgb = (image: HTMLImageElement, largest: number) => {
    const scale = Math.min(1, largest / Math.max(image.naturalWidth, image.naturalHeight));
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(image.naturalWidth * scale));
    out.height = Math.max(1, Math.round(image.naturalHeight * scale));
    out.getContext('2d', { colorSpace: 'srgb' })?.drawImage(image, 0, 0, out.width, out.height);
    return out;
  };

  const start = async () => {
    const image = new Image();
    image.src = src;
    try {
      await image.decode();
    } catch {
      broken = true;
      return;
    }
    if (gone || !canvas) {
      return;
    }
    ratio = image.naturalWidth / image.naturalHeight;
    try {
      preview = new AdjustPreview(canvas);
      source = inSrgb(image, preview.maxSize);
      preview.photo(source);
    } catch {
      preview = undefined;
      live = 'off';
      return;
    }
    // the filters' thumbnails start from a small square out of the middle
    const side = Math.min(source.width, source.height);
    const square = document.createElement('canvas');
    square.width = square.height = THUMB;
    const context = square.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
    context?.drawImage(source, (source.width - side) / 2, (source.height - side) / 2, side, side, 0, 0, THUMB, THUMB);
    small = context?.getImageData(0, 0, THUMB, THUMB);
    live = 'ready';
    requestAnimationFrame(fit);
  };

  // ---- the filters' thumbnails: each filter over the photo as adjusted so far ----

  let thumbTimer: ReturnType<typeof setTimeout> | undefined;

  const drawThumbs = () => {
    if (!small) {
      return;
    }
    for (const name of CHOICES) {
      const target = thumbs[name]?.getContext('2d', { colorSpace: 'srgb' });
      if (!target) {
        continue;
      }
      const pixel = colour(effective({ ...settings, filter: name === 'none' ? null : name, intensity: 1 }));
      const out = target.createImageData(THUMB, THUMB);
      const data = small.data;
      for (let at = 0; at < data.length; at += 4) {
        const [r, g, b] = pixel(data[at] / 255, data[at + 1] / 255, data[at + 2] / 255);
        // a clamped array rounds to the nearest level itself
        out.data[at] = r * 255;
        out.data[at + 1] = g * 255;
        out.data[at + 2] = b * 255;
        out.data[at + 3] = 255;
      }
      target.putImageData(out, 0, 0);
    }
  };

  $effect(() => {
    // the adjustments the thumbnails start from (the filter itself does not change them)
    void JSON.stringify(SLIDERS.map((key) => settings[key]));
    if (tab === 'filters' && live === 'ready') {
      clearTimeout(thumbTimer);
      thumbTimer = setTimeout(drawThumbs, 120);
    }
  });

  // ---- the sliders ----

  const percent = (value: number) => Math.round(value * 100);
  const signed = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${-value}` : '0');
  const degrees = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)}°`;
  /** the track lit from the slider's rest point to its value, as percentages of its length */
  const lit = (rest: number, value: number) => `--lo: ${Math.min(rest, value)}%; --hi: ${Math.max(rest, value)}%`;

  const set = (key: Slider, value: number) => {
    settings[key] = value / 100;
  };

  const pickFilter = (name: FilterName | null) => {
    settings.filter = name;
    settings.intensity = 1;
  };

  // ---- keeping ----

  const fail = (error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);
    message = $t('adjust_failed', { values: { reason } });
    saving = false;
    job = undefined;
  };

  /** the stack the new version heads now, told to the viewer and the timeline; the version once Gallery drew it */
  const newVersion = async () => {
    try {
      const updated = await getAssetInfo({ id: asset.id });
      if (!updated.stack) {
        return;
      }
      const stack = await getStack({ id: updated.stack.id });
      eventManager.emit('StackCreate', stack);
      const until = Date.now() + DRAWN_MS;
      while (!gone && Date.now() < until) {
        const version = await getAssetInfo({ id: stack.primaryAssetId });
        if (version.thumbhash) {
          return version;
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
    } catch {
      // the stack shows on the next visit anyway
    }
  };

  const accept = async (suggestionId: number) => {
    const result = await curator.decide([suggestionId], 'accept');
    if (!(result.applied ?? []).includes(suggestionId)) {
      message = $t('ai_inbox_some_failed', { values: { count: 1 } });
      saving = false;
      job = undefined;
      return;
    }
    const version = await newVersion();
    const label = $t('adjust_kept');
    const entry = undoManager.record(
      label,
      async () => {
        const undone = await curator.undo([suggestionId]);
        const problem = undone.conflicts[0] ?? undone.failed?.[0];
        if (problem) {
          throw new Error(problem.reason);
        }
        await refreshAssets(version ? [asset.id, version.id] : [asset.id]);
        return $t('adjust_undone');
      },
      $t('adjust_undo_failed'),
    );
    toastUndoable(label, entry);
    if (version && !gone) {
      onKept?.(version);
    }
    close();
  };

  /** the job's state until it is done, then its suggestion accepted */
  const follow = async (id: number) => {
    while (!gone && job === id) {
      let rows: JobRow[];
      try {
        rows = await curator.jobs(50);
      } catch (error) {
        fail(error);
        return;
      }
      if (gone || job !== id) {
        return;
      }
      const mine = rows.find((row) => row.id === id);
      if (!mine || mine.status === 'cancelled') {
        saving = false;
        job = undefined;
        return;
      }
      if (mine.status === 'failed') {
        fail((mine.error ?? '').split('\n', 1)[0]);
        return;
      }
      if (mine.status === 'done') {
        const made = mine.result?.suggestion_id;
        if (typeof made !== 'number') {
          fail($t('remove_objects_no_result'));
          return;
        }
        try {
          await accept(made);
        } catch (error) {
          fail(error);
        }
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  };

  const keep = async () => {
    if (!dirty || saving) {
      return;
    }
    saving = true;
    message = undefined;
    try {
      const { job: id } = await curator.adjust(asset.id, $state.snapshot(settings));
      job = id;
      await follow(id);
    } catch (error) {
      fail(error);
    }
  };

  /** back to the sliders; the render stops */
  const stopSaving = async () => {
    const id = job;
    job = undefined;
    saving = false;
    if (id) {
      await curator.cancelJob(id).catch(() => undefined);
    }
  };

  const close = () => {
    gone = true;
    onClose();
  };

  /** Cancel, Escape and the close button: changes made are lost, so they ask first, as Gallery's own editor does */
  const leave = async () => {
    if (saving) {
      // the render goes on and its result waits in the AI inbox
      close();
      return;
    }
    if (dirty) {
      confirming = true;
      const discard = await modalManager.showDialog({
        title: $t('editor_discard_edits_title'),
        prompt: $t('editor_discard_edits_prompt'),
        confirmText: $t('editor_discard_edits_confirm'),
      });
      confirming = false;
      if (!discard) {
        return;
      }
    }
    close();
  };

  const isOriginalKey = (event: KeyboardEvent) =>
    event.key.toLowerCase() === 'm' && !event.ctrlKey && !event.metaKey && !event.altKey;

  const onKeydown = (event: KeyboardEvent) => {
    if (confirming || (event.target instanceof HTMLInputElement && event.target.type !== 'range')) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      void leave();
    } else if (isOriginalKey(event)) {
      original = true;
    }
    // the viewer's own keys (arrows to the next photo, Delete) wait while the panel is open
    event.stopPropagation();
  };

  const onKeyup = (event: KeyboardEvent) => {
    if (isOriginalKey(event)) {
      original = false;
    }
  };

  onMount(() => {
    void start();
    const observer = new ResizeObserver(() => fit());
    if (frameElement) {
      observer.observe(frameElement);
    }
    return () => observer.disconnect();
  });

  onDestroy(() => {
    gone = true;
    cancelAnimationFrame(frameRequest);
    clearTimeout(resting);
    clearTimeout(thumbTimer);
    preview?.destroy();
  });
</script>

<svelte:window onkeydowncapture={onKeydown} onkeyupcapture={onKeyup} onblur={() => (original = false)} />

{#snippet slider(key: Slider)}
  {@const value = percent(settings[key])}
  <label class="adjust-row" ondblclick={() => set(key, 0)}>
    <span class="adjust-name">{$t(`adjust_${key}`)}</span>
    <span class="adjust-value" class:is-set={value !== 0}>{signed(value)}</span>
    <input
      type="range"
      min="-100"
      max="100"
      step="1"
      {value}
      disabled={saving}
      style={lit(50, (value + 100) / 2)}
      oninput={(event) => set(key, Number(event.currentTarget.value))}
    />
  </label>
{/snippet}

<div class="adjust dark" role="dialog" aria-modal="true" aria-label={$t('adjust')}>
  <div class="adjust-stage">
    {#if broken}
      <p class="adjust-note">{$t('remove_objects_no_photo')}</p>
    {:else}
      <div
        class="adjust-frame"
        style:--ratio={ratio}
        bind:this={frameElement}
        onpointerdown={() => (original = true)}
        onpointerup={() => (original = false)}
        onpointerleave={() => (original = false)}
        onpointercancel={() => (original = false)}
        role="presentation"
      >
        <!-- the photo as it is until the preview takes over, and in its place where WebGL2 is missing -->
        <img {src} alt="" draggable="false" class:is-hidden={live === 'ready'} />
        <canvas bind:this={canvas} class:is-hidden={live !== 'ready'}></canvas>
        {#if tab === 'straighten' && !original}
          <div class="adjust-grid" aria-hidden="true"></div>
        {/if}
        {#if saving}
          <div class="adjust-wait" role="status">
            <span class="adjust-spinner" aria-hidden="true"></span>
            <span>{$t('adjust_saving')}</span>
            <small>{$t('remove_objects_later')}</small>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <aside class="adjust-panel">
    <header class="adjust-head">
      <span class="adjust-title">
        <Icon icon={mdiTuneVariant} size="18" />
        {$t('adjust')}
      </span>
      <button type="button" class="adjust-icon" aria-label={$t('close')} title={$t('close')} onclick={() => leave()}>
        <Icon icon={mdiClose} size="20" />
      </button>
    </header>

    <div class="ws-seg adjust-tabs" role="group" aria-label={$t('adjust')}>
      <button type="button" aria-pressed={tab === 'adjust'} onclick={() => (tab = 'adjust')}>{$t('adjust')}</button>
      <button type="button" aria-pressed={tab === 'filters'} onclick={() => (tab = 'filters')}>
        {$t('adjust_filters')}
      </button>
      <button type="button" aria-pressed={tab === 'straighten'} onclick={() => (tab = 'straighten')}>
        {$t('adjust_straighten')}
      </button>
    </div>

    <div class="adjust-body">
      {#if tab === 'adjust'}
        <section class="adjust-group">
          <h3>{$t('adjust_light')}</h3>
          {#each LIGHT as key (key)}
            {@render slider(key)}
          {/each}
        </section>
        <section class="adjust-group">
          <h3>{$t('color')}</h3>
          {#each COLOR as key (key)}
            {@render slider(key)}
          {/each}
        </section>
        <section class="adjust-group">
          {@render slider('vignette')}
        </section>
      {:else if tab === 'filters'}
        <div class="adjust-filters">
          {#each CHOICES as name (name)}
            {@const chosen = (settings.filter ?? 'none') === name}
            <button
              type="button"
              class="adjust-filter"
              aria-pressed={chosen}
              disabled={saving}
              onclick={() => pickFilter(name === 'none' ? null : name)}
            >
              <canvas width={THUMB} height={THUMB} bind:this={thumbs[name]}></canvas>
              <span>{$t(FILTER_KEYS[name])}</span>
            </button>
          {/each}
        </div>
        {#if settings.filter}
          {@const value = percent(settings.intensity)}
          <label class="adjust-row" ondblclick={() => (settings.intensity = 1)}>
            <span class="adjust-name">{$t('adjust_intensity')}</span>
            <span class="adjust-value is-set">{value}</span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              {value}
              disabled={saving}
              style={lit(0, value)}
              oninput={(event) => (settings.intensity = Number(event.currentTarget.value) / 100)}
            />
          </label>
        {/if}
      {:else}
        <p class="adjust-hint">{$t('adjust_straighten_hint')}</p>
        <label class="adjust-row" ondblclick={() => (settings.angle = 0)}>
          <span class="adjust-name">{$t('adjust_straighten')}</span>
          <span class="adjust-value" class:is-set={settings.angle !== 0}>{degrees(settings.angle)}</span>
          <input
            type="range"
            min="-45"
            max="45"
            step="0.1"
            value={settings.angle}
            disabled={saving}
            style={lit(50, ((settings.angle + 45) / 90) * 100)}
            oninput={(event) => (settings.angle = Number(event.currentTarget.value))}
          />
        </label>
      {/if}
    </div>

    <footer class="adjust-foot">
      <p
        class="adjust-note"
        class:is-error={!!message}
        class:is-hint={!message && live !== 'off'}
        role={message ? 'alert' : undefined}
      >
        {message ?? (live === 'off' ? $t('adjust_no_preview') : $t('adjust_hint'))}
      </p>
      <button
        type="button"
        class="ws-btn-quiet adjust-hold"
        disabled={live !== 'ready'}
        onpointerdown={() => (original = true)}
        onpointerup={() => (original = false)}
        onpointerleave={() => (original = false)}
      >
        {$t('live_effects_original')}
      </button>
      <div class="adjust-actions">
        <button type="button" class="ws-btn-quiet" disabled={!dirty || saving} onclick={() => (settings = neutral())}>
          {$t('reset')}
        </button>
        <span class="adjust-spacer"></span>
        {#if saving}
          <button type="button" class="ws-btn-quiet" onclick={stopSaving}>{$t('cancel')}</button>
        {:else}
          <button type="button" class="ws-btn-quiet" onclick={() => leave()}>{$t('cancel')}</button>
        {/if}
        <button type="button" class="ws-btn" disabled={!dirty || saving} onclick={keep}>{$t('keep')}</button>
      </div>
    </footer>
  </aside>
</div>

<style>
  .adjust {
    /* the panel's own hairline: the theme's is drawn for the page's ground, not for the dark glass */
    --ws-hairline: rgb(255 255 255 / 0.14);
    --adjust-track: rgb(255 255 255 / 0.18);
    --adjust-ink: rgb(255 255 255 / 0.92);
    position: absolute;
    inset: 0;
    z-index: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 20rem;
    color: rgb(255 255 255 / 0.9);
  }
  .adjust-stage {
    min-width: 0;
    min-height: 0;
    display: grid;
    place-items: center;
    padding: calc(var(--ws-gap) * 1.5);
    container-type: size;
  }
  /* the photo at its own shape, as large as the stage allows; straightened, it keeps that shape */
  .adjust-frame {
    position: relative;
    width: min(100cqw, 100cqh * var(--ratio));
    aspect-ratio: var(--ratio);
    touch-action: none;
    user-select: none;
  }
  .adjust-frame img,
  .adjust-frame canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border-radius: var(--ws-radius);
  }
  .adjust-frame img {
    object-fit: contain;
  }
  .is-hidden {
    visibility: hidden;
  }
  /* thirds, and thirds of those, to level a horizon against */
  .adjust-grid {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image:
      linear-gradient(to right, rgb(255 255 255 / 0.45) 1px, transparent 1px),
      linear-gradient(to bottom, rgb(255 255 255 / 0.45) 1px, transparent 1px),
      linear-gradient(to right, rgb(255 255 255 / 0.18) 1px, transparent 1px),
      linear-gradient(to bottom, rgb(255 255 255 / 0.18) 1px, transparent 1px);
    background-size:
      calc(100% / 3) 100%,
      100% calc(100% / 3),
      calc(100% / 9) 100%,
      100% calc(100% / 9);
    background-position: -1px -1px;
    /* the lines that would fall on the frame's right and bottom edge */
    clip-path: inset(0 1px 1px 0);
  }
  .adjust-wait {
    position: absolute;
    left: 50%;
    bottom: 1rem;
    translate: -50% 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.15rem 0.6rem;
    align-items: center;
    max-width: calc(100% - 2rem);
    padding: 0.6rem 1rem;
    border: 1px solid var(--ws-glass-edge);
    border-radius: var(--ws-radius);
    background: var(--ws-glass-strong);
    -webkit-backdrop-filter: var(--ws-glass-blur);
    backdrop-filter: var(--ws-glass-blur);
    font-size: var(--ws-text-ui);
    font-weight: 600;
  }
  .adjust-wait small {
    grid-column: 2;
    font-size: var(--ws-text-meta);
    font-weight: 400;
    color: rgb(255 255 255 / 0.7);
  }
  .adjust-spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid rgb(255 255 255 / 0.25);
    border-top-color: var(--ws-accent);
    border-radius: 50%;
    animation: adjust-spin 0.9s linear infinite;
  }
  @keyframes adjust-spin {
    to {
      rotate: 1turn;
    }
  }

  /* the side panel: smoked glass along the stage's edge, as calm as the viewer's other panels */
  .adjust-panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-inline-start: 1px solid var(--ws-glass-edge);
    background: var(--ws-glass-strong);
    -webkit-backdrop-filter: var(--ws-glass-blur);
    backdrop-filter: var(--ws-glass-blur);
  }
  .adjust-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.75rem 0.75rem 0.5rem 1rem;
  }
  .adjust-title {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-size: var(--ws-text-heading);
    font-weight: 650;
  }
  .adjust-icon {
    display: grid;
    place-items: center;
    padding: 0.4rem;
    border-radius: var(--ws-radius);
  }
  .adjust-icon:hover {
    background: rgb(255 255 255 / 0.1);
  }
  .adjust-icon:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 1px;
  }
  .adjust-tabs {
    display: flex;
    margin: 0 1rem 0.5rem;
  }
  .adjust-tabs > button {
    flex: 1 1 0;
    min-width: 0;
    padding-inline: 0.4rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .adjust-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 0 1rem 1rem;
    scrollbar-width: thin;
  }
  .adjust-group + .adjust-group {
    margin-top: 0.5rem;
    border-top: 1px solid var(--ws-hairline);
  }
  .adjust-group h3 {
    padding: 0.85rem 0 0.25rem;
    font-size: var(--ws-text-meta);
    font-weight: 600;
    color: rgb(255 255 255 / 0.6);
  }
  .adjust-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.1rem 0.75rem;
    align-items: baseline;
    padding: 0.45rem 0 0.2rem;
    cursor: default;
  }
  .adjust-name {
    font-size: var(--ws-text-ui);
    font-weight: 500;
  }
  .adjust-value {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: rgb(255 255 255 / 0.5);
  }
  .adjust-value.is-set {
    color: var(--adjust-ink);
  }
  /* a slider lit from its rest point (zero, or the left end) to its value, a square thumb on a hairline track */
  .adjust-row input[type='range'] {
    grid-column: 1 / -1;
    width: 100%;
    height: 1.25rem;
    margin: 0;
    padding: 0;
    /* not the boxed field the theme gives inputs in dialogs */
    border: 0;
    background: transparent;
    appearance: none;
    cursor: pointer;
  }
  .adjust-row input:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .adjust-row input::-webkit-slider-runnable-track {
    height: 2px;
    background: linear-gradient(
      to right,
      var(--adjust-track) var(--lo),
      var(--adjust-ink) var(--lo) var(--hi),
      var(--adjust-track) var(--hi)
    );
  }
  .adjust-row input::-moz-range-track {
    height: 2px;
    background: linear-gradient(
      to right,
      var(--adjust-track) var(--lo),
      var(--adjust-ink) var(--lo) var(--hi),
      var(--adjust-track) var(--hi)
    );
  }
  .adjust-row input::-webkit-slider-thumb {
    width: 0.75rem;
    height: 0.75rem;
    margin-top: calc(1px - 0.375rem);
    border: 0;
    border-radius: var(--ws-radius);
    background: var(--adjust-ink);
    appearance: none;
  }
  .adjust-row input::-moz-range-thumb {
    width: 0.75rem;
    height: 0.75rem;
    border: 0;
    border-radius: var(--ws-radius);
    background: var(--adjust-ink);
  }
  .adjust-row input:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }
  .adjust-hint {
    padding: 0.75rem 0 0.25rem;
    font-size: var(--ws-text-meta);
    line-height: 1.45;
    color: rgb(255 255 255 / 0.7);
  }
  .adjust-filters {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(5.25rem, 1fr));
    gap: calc(var(--ws-gap) * 0.8);
    padding: 0.75rem 0;
  }
  .adjust-filter {
    display: grid;
    align-content: start;
    gap: 0.3rem;
    min-width: 0;
    padding: 0;
    color: inherit;
    text-align: start;
  }
  .adjust-filter canvas {
    width: 100%;
    aspect-ratio: 1;
    border-radius: var(--ws-radius);
    outline: 1px solid var(--ws-glass-edge);
    outline-offset: -1px;
    background: rgb(255 255 255 / 0.06);
  }
  /* two-word names (Dramatic Warm, Lebendig kühl) take a second line rather than an ellipsis */
  .adjust-filter span {
    padding: 0.1rem 0.3rem;
    border-radius: var(--ws-radius);
    font-size: var(--ws-text-meta);
    line-height: 1.25;
    overflow-wrap: anywhere;
  }
  /* the chosen filter inverts its name, as the bar's active workspace does; focus keeps the accent */
  .adjust-filter[aria-pressed='true'] canvas {
    outline: var(--ws-border) solid var(--immich-ui-dark);
    outline-offset: calc(var(--ws-border) * -1);
  }
  .adjust-filter[aria-pressed='true'] span {
    background: var(--immich-ui-dark);
    color: var(--immich-ui-light);
    font-weight: 600;
  }
  .adjust-filter:hover:not([aria-pressed='true']) span {
    background: rgb(255 255 255 / 0.1);
  }
  .adjust-filter:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 3px;
  }
  .adjust-filter:disabled {
    opacity: 0.45;
  }
  .adjust-foot {
    display: grid;
    gap: 0.5rem;
    padding: 0.75rem 1rem 1rem;
    border-top: 1px solid var(--ws-hairline);
  }
  .adjust-note {
    font-size: var(--ws-text-meta);
    line-height: 1.45;
    color: rgb(255 255 255 / 0.7);
  }
  .adjust-note.is-error {
    color: #fff;
    font-weight: 600;
  }
  .adjust-hold {
    justify-self: start;
    margin-inline-start: -0.6rem;
    user-select: none;
    touch-action: none;
  }
  .adjust-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .adjust-spacer {
    flex: 1;
  }

  /* a phone: the photo above, the panel below it */
  @media (max-width: 767px) {
    .adjust {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr) auto;
    }
    .adjust-panel {
      max-height: 55vh;
      border-inline-start: 0;
      border-top: 1px solid var(--ws-glass-edge);
    }
  }
  /* double-clicks and the M key are for a mouse and a keyboard */
  @media (pointer: coarse) {
    .adjust-note.is-hint {
      display: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .adjust-spinner {
      animation-duration: 3s;
    }
  }
</style>
