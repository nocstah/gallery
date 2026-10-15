<script lang="ts">
  // Local Omarchy layer: the object-removal brush (Curator's restore.inpaint, ~/code/curator/curator/jobs/retouch.py).
  // Over the photo as the viewer shows it the user paints what should go; Remove sends the strokes as a mask (white on
  // black, at the preview's own size) and Curator's restorer fills them in with LaMa at the photo's full size. The
  // result is a suggestion (a new version, stacked on top when kept), shown with the before/after divider: Keep
  // accepts it, Discard rejects it and goes back to the strokes. Closed while the restorer works, the result waits in
  // the AI inbox.
  import RestoreCompare from '$lib/components/curator/RestoreCompare.svelte';
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { getAssetMediaUrl } from '$lib/utils';
  import { curator, type JobRow, type Suggestion } from '$lib/utils/curator';
  import { AssetMediaSize, getAssetInfo, getStack, type AssetResponseDto } from '@immich/sdk';
  import { Icon, toastManager } from '@immich/ui';
  import { mdiClose, mdiDeleteSweepOutline, mdiEraser, mdiUndoVariant } from '@mdi/js';
  import { onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    asset: AssetResponseDto;
    onClose: () => void;
  }

  let { asset, onClose }: Props = $props();

  type Point = [number, number];
  /** a stroke in the canvas's own pixels (the preview's), with its width in the same pixels */
  type Stroke = { width: number; points: Point[] };
  type Phase = 'paint' | 'sending' | 'waiting' | 'working' | 'result';

  const SIZE = { min: 8, max: 160, step: 4 };
  const POLL_MS = 1000;

  let phase = $state<Phase>('paint');
  let strokes = $state.raw<Stroke[]>([]);
  let size = $state(40);
  let natural = $state<{ width: number; height: number }>();
  let broken = $state(false);
  let canvas = $state<HTMLCanvasElement>();
  let ring = $state<{ x: number; y: number }>();
  let job = $state<number>();
  let held = $state<'busy' | 'paused' | 'idle'>('idle');
  let suggestion = $state<Suggestion>();
  let message = $state<string>();
  let deciding = $state(false);
  let drawing: Stroke | undefined;
  let gone = false;

  const src = $derived(getAssetMediaUrl({ id: asset.id, size: AssetMediaSize.Preview, cacheKey: asset.thumbhash }));
  const ratio = $derived(natural ? natural.width / natural.height : 4 / 3);
  const painting = $derived(phase === 'paint');
  const status = $derived.by(() => {
    if (phase === 'working') {
      return $t('remove_objects_working');
    }
    if (held === 'paused') {
      return $t('remove_objects_waiting_paused');
    }
    return held === 'busy' ? $t('remove_objects_waiting_busy') : $t('remove_objects_waiting');
  });

  // ---- painting ----

  /** the strokes' colour on screen: the theme's accent, seen through the canvas's own transparency */
  const ink = () => (canvas && getComputedStyle(canvas).getPropertyValue('--ws-accent').trim()) || '#ff453a';

  const pen = (context: CanvasRenderingContext2D, colour: string) => {
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = colour;
    context.fillStyle = colour;
  };

  /** a stroke from its `from`th point on (the whole of it by default) */
  const draw = (context: CanvasRenderingContext2D, stroke: Stroke, from = 0) => {
    const { points, width } = stroke;
    if (points.length === 1) {
      context.beginPath();
      context.arc(points[0][0], points[0][1], width / 2, 0, Math.PI * 2);
      context.fill();
      return;
    }
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(...points[Math.max(0, from - 1)]);
    for (const point of points.slice(Math.max(1, from))) {
      context.lineTo(...point);
    }
    context.stroke();
  };

  const redraw = () => {
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    pen(context, ink());
    for (const stroke of strokes) {
      draw(context, stroke);
    }
  };

  /** canvas pixels per screen pixel */
  const scale = () => (canvas ? canvas.width / (canvas.getBoundingClientRect().width || 1) : 1);

  const at = (event: PointerEvent): Point => {
    const rect = canvas!.getBoundingClientRect();
    return [
      ((event.clientX - rect.left) * canvas!.width) / (rect.width || 1),
      ((event.clientY - rect.top) * canvas!.height) / (rect.height || 1),
    ];
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!painting || !canvas || (event.pointerType === 'mouse' && event.button !== 0)) {
      return;
    }
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    drawing = { width: size * scale(), points: [at(event)] };
    message = undefined;
    const context = canvas.getContext('2d');
    if (context) {
      pen(context, ink());
      draw(context, drawing);
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!canvas) {
      return;
    }
    if (event.pointerType !== 'touch') {
      const rect = canvas.getBoundingClientRect();
      ring = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }
    if (!drawing) {
      return;
    }
    const from = drawing.points.length;
    drawing.points.push(at(event));
    const context = canvas.getContext('2d');
    if (context) {
      pen(context, ink());
      draw(context, drawing, from);
    }
  };

  const onPointerUp = () => {
    if (drawing) {
      strokes = [...strokes, drawing];
      drawing = undefined;
    }
  };

  const undo = () => {
    strokes = strokes.slice(0, -1);
    redraw();
  };

  const clear = () => {
    strokes = [];
    redraw();
  };

  /** what was painted, white on black at the preview's own size: what Curator fills in */
  const mask = () => {
    const out = document.createElement('canvas');
    out.width = canvas!.width;
    out.height = canvas!.height;
    const context = out.getContext('2d')!;
    context.fillStyle = '#000';
    context.fillRect(0, 0, out.width, out.height);
    pen(context, '#fff');
    for (const stroke of strokes) {
      draw(context, stroke);
    }
    return out.toDataURL('image/png');
  };

  // ---- the restorer ----

  const fail = (error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);
    message = $t('remove_objects_failed', { values: { reason } });
    phase = 'paint';
    job = undefined;
  };

  /** The job's state once a second: waiting (behind what, if anything), working, then its suggestion. */
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
        phase = 'paint';
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
          suggestion = await curator.suggestion(made);
          phase = 'result';
        } catch (error) {
          fail(error);
        }
        return;
      }
      if (mine.status === 'running') {
        phase = 'working';
      } else {
        // queued: behind another restore job (perhaps paused for a game), or the restorer has not taken it yet
        const other = rows.find((row) => row.status === 'running' && row.id !== id && row.kind.startsWith('restore.'));
        held = other ? (other.progress?.paused ? 'paused' : 'busy') : 'idle';
        phase = 'waiting';
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  };

  const remove = async () => {
    if (!canvas || strokes.length === 0) {
      return;
    }
    phase = 'sending';
    held = 'idle';
    message = undefined;
    try {
      const { job: id } = await curator.inpaint(asset.id, mask());
      job = id;
      phase = 'waiting';
      void follow(id);
    } catch (error) {
      fail(error);
    }
  };

  const cancel = async () => {
    const id = job;
    job = undefined;
    phase = 'paint';
    if (id) {
      await curator.cancelJob(id).catch(() => undefined);
    }
  };

  /** Show the new version in this photo's stack strip at once. */
  const refreshStack = async () => {
    try {
      const updated = await getAssetInfo({ id: asset.id });
      if (updated.stack) {
        eventManager.emit('StackCreate', await getStack({ id: updated.stack.id }));
      }
    } catch {
      // the stack shows on the next visit anyway
    }
  };

  const keep = async () => {
    if (!suggestion || deciding) {
      return;
    }
    deciding = true;
    message = undefined;
    try {
      const result = await curator.decide([suggestion.id], 'accept');
      if (!(result.applied ?? []).includes(suggestion.id)) {
        message = $t('ai_inbox_some_failed', { values: { count: 1 } });
        return;
      }
      toastManager.primary($t('remove_objects_kept'));
      await refreshStack();
      close();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    } finally {
      deciding = false;
    }
  };

  const discard = async () => {
    if (!suggestion || deciding) {
      return;
    }
    deciding = true;
    try {
      await curator.decide([suggestion.id], 'reject');
      suggestion = undefined;
      job = undefined;
      phase = 'paint';
      // the strokes are still there to change and try again
      requestAnimationFrame(redraw);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    } finally {
      deciding = false;
    }
  };

  const close = () => {
    gone = true;
    onClose();
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement && event.target.type !== 'range') {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'escape') {
      close();
    } else if (painting && key === '[') {
      size = Math.max(SIZE.min, size - SIZE.step);
    } else if (painting && key === ']') {
      size = Math.min(SIZE.max, size + SIZE.step);
    } else if (painting && key === 'z' && (event.ctrlKey || event.metaKey)) {
      undo();
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  onDestroy(() => {
    gone = true;
  });
</script>

<svelte:window onkeydowncapture={onKeydown} />

<div class="remove dark" role="dialog" aria-modal="true" aria-label={$t('remove_objects')}>
  <header class="remove-head">
    <span class="remove-pill remove-title">
      <Icon icon={mdiEraser} size="18" />
      {$t('remove_objects')}
    </span>
    <button type="button" class="remove-pill remove-icon" aria-label={$t('close')} title={$t('close')} onclick={close}>
      <Icon icon={mdiClose} size="20" />
    </button>
  </header>

  <div class="remove-stage">
    {#if phase === 'result' && suggestion}
      <RestoreCompare {suggestion} size="stage" />
    {:else if broken}
      <p class="remove-note">{$t('remove_objects_no_photo')}</p>
    {:else}
      <div class="remove-frame" class:is-busy={!painting} style:--ratio={ratio}>
        <img
          {src}
          alt=""
          draggable="false"
          onload={(event) => {
            const image = event.currentTarget as HTMLImageElement;
            natural = { width: image.naturalWidth, height: image.naturalHeight };
          }}
          onerror={() => (broken = true)}
        />
        {#if natural}
          <canvas
            bind:this={canvas}
            width={natural.width}
            height={natural.height}
            aria-label={$t('remove_objects_hint')}
            onpointerdown={onPointerDown}
            onpointermove={onPointerMove}
            onpointerup={onPointerUp}
            onpointercancel={onPointerUp}
            onpointerleave={() => (ring = undefined)}
          ></canvas>
        {/if}
        {#if ring && painting}
          <span class="remove-ring" style:left="{ring.x}px" style:top="{ring.y}px" style:--size="{size}px"></span>
        {/if}
        {#if !painting}
          <div class="remove-wait" role="status">
            <span class="remove-spinner" aria-hidden="true"></span>
            <span>{status}</span>
            <small>{$t('remove_objects_later')}</small>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <footer class="remove-foot">
    {#if phase === 'result'}
      <p class="remove-note" class:is-error={!!message}>{message ?? $t('remove_objects_result')}</p>
      <div class="remove-pill remove-actions">
        <button type="button" class="ws-btn-quiet" disabled={deciding} onclick={discard}>
          {$t('remove_objects_discard')}
        </button>
        <button type="button" class="ws-btn" disabled={deciding} onclick={keep}>{$t('remove_objects_keep')}</button>
      </div>
    {:else if painting}
      <p class="remove-note" class:is-error={!!message}>{message ?? $t('remove_objects_hint')}</p>
      <div class="remove-pill remove-actions">
        <input
          class="remove-size"
          type="range"
          min={SIZE.min}
          max={SIZE.max}
          step={SIZE.step}
          bind:value={size}
          aria-label={$t('remove_objects_brush_size')}
          title={$t('remove_objects_brush_size')}
        />
        <button
          type="button"
          class="ws-btn-quiet remove-icon"
          disabled={strokes.length === 0}
          aria-label={$t('remove_objects_undo')}
          title={$t('remove_objects_undo')}
          onclick={undo}
        >
          <Icon icon={mdiUndoVariant} size="18" />
        </button>
        <button
          type="button"
          class="ws-btn-quiet remove-icon"
          disabled={strokes.length === 0}
          aria-label={$t('clear')}
          title={$t('clear')}
          onclick={clear}
        >
          <Icon icon={mdiDeleteSweepOutline} size="18" />
        </button>
        <button type="button" class="ws-btn" disabled={strokes.length === 0} onclick={remove}>
          {$t('remove_objects_submit')}
        </button>
      </div>
    {:else if phase === 'waiting'}
      <div class="remove-pill remove-actions">
        <button type="button" class="ws-btn-quiet" onclick={cancel}>{$t('cancel')}</button>
      </div>
    {/if}
  </footer>
</div>

<style>
  .remove {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 0.75rem;
    padding: 0.75rem clamp(0.75rem, 2vw, 1.5rem) 1rem;
    color: rgb(255 255 255 / 0.9);
  }
  .remove-head,
  .remove-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
  }
  .remove-foot {
    justify-content: center;
  }
  /* smoked glass over the photo, as the viewer's own bar */
  .remove-pill {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    border: 1px solid var(--ws-glass-edge);
    border-radius: var(--ws-radius);
    background: var(--ws-glass);
    -webkit-backdrop-filter: var(--ws-glass-blur);
    backdrop-filter: var(--ws-glass-blur);
  }
  .remove-title {
    gap: 0.45rem;
    padding: 0.4rem 0.85rem 0.4rem 0.65rem;
    font-size: 0.9rem;
    font-weight: 600;
  }
  .remove-icon {
    display: grid;
    place-items: center;
    padding: 0.45rem;
  }
  button.remove-icon:not(.ws-btn-quiet):hover {
    background: rgb(255 255 255 / 0.1);
  }
  .remove-actions {
    gap: 0.25rem;
    padding: 4px;
  }
  .remove-actions .ws-btn,
  .remove-actions .ws-btn-quiet {
    border-radius: var(--ws-radius);
  }
  .remove-size {
    width: 7.5rem;
    margin-inline: 0.6rem 0.3rem;
    accent-color: var(--ws-accent);
  }
  .remove-note {
    flex-basis: 100%;
    text-align: center;
    font-size: 0.85rem;
    color: rgb(255 255 255 / 0.72);
  }
  .remove-note.is-error {
    color: #fff;
    font-weight: 600;
  }
  .remove-stage {
    min-height: 0;
    display: grid;
    place-items: center;
    container-type: size;
  }
  /* the photo at its own shape, as large as the stage allows; the canvas lies exactly over it */
  .remove-frame {
    position: relative;
    width: min(100cqw, 100cqh * var(--ratio));
    aspect-ratio: var(--ratio);
  }
  .remove-frame img,
  .remove-frame canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .remove-frame img {
    object-fit: contain;
    user-select: none;
  }
  .remove-frame canvas {
    opacity: 0.55;
    cursor: none;
    touch-action: none;
  }
  .remove-frame.is-busy canvas {
    opacity: 0.3;
    pointer-events: none;
  }
  .remove-ring {
    position: absolute;
    width: var(--size);
    height: var(--size);
    translate: -50% -50%;
    border: 1.5px solid #fff;
    border-radius: 50%;
    box-shadow:
      0 0 0 1px rgb(0 0 0 / 0.45),
      inset 0 0 0 1px rgb(0 0 0 / 0.45);
    pointer-events: none;
  }
  .remove-wait {
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
    border-radius: 14px;
    background: var(--ws-glass-strong);
    -webkit-backdrop-filter: var(--ws-glass-blur);
    backdrop-filter: var(--ws-glass-blur);
    font-size: 0.9rem;
    font-weight: 600;
  }
  .remove-wait small {
    grid-column: 2;
    font-size: 0.8rem;
    font-weight: 400;
    color: rgb(255 255 255 / 0.7);
  }
  .remove-spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid rgb(255 255 255 / 0.25);
    border-top-color: var(--ws-accent);
    border-radius: 50%;
    animation: remove-spin 0.9s linear infinite;
  }
  @keyframes remove-spin {
    to {
      rotate: 1turn;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .remove-spinner {
      animation-duration: 3s;
    }
  }
</style>
