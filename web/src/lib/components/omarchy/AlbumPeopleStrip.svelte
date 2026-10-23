<script lang="ts">
  // Local Omarchy layer: the people in an album as a row of small faces in the album page's details (the block that
  // scrolls away). A face narrows the album to that person, as the filter rail's People does, and a second click takes
  // it back. The faces are the rail's own: the album's named, visible people, from the same suggestions call. Wider
  // screens show them as chips with their names; a phone (below 640px) as one row of 32px faces that scrolls sideways
  // (the owner's choice, 2026-10-18: thirteen chips had wrapped into five rows above the photos), each face named for a
  // screen reader and its name shown over it while it holds the keyboard's focus or a finger rests on it. More people
  // than the row holds end it with +N, which opens the filters, where People lists them all.
  import { portal } from '$lib/elements/Portal.svelte';
  import { peopleRanking } from '$lib/managers/people-ranking.svelte';
  import { mediaQueryManager } from '$lib/stores/media-query-manager.svelte';
  import { locale } from '$lib/stores/preferences.store';
  import { buildAlbumDetailFilterConfig } from '$lib/utils/album-filter-config';
  import { t } from 'svelte-i18n';

  type Person = { id: string; name: string; thumbnailUrl?: string };
  type Props = {
    albumId: string;
    /** the people the album is narrowed to (filter ids) */
    selected: string[];
    onToggle: (person: Person) => void;
    /** +N, the people past the row's last face: opens the filters, whose People lists them all */
    onMore?: () => void;
  };

  const { albumId, selected, onToggle, onMore }: Props = $props();

  const MAX_FACES = 16;
  let everyone = $state<Person[]>([]);
  // in the People page's order (managers/people-ranking), as the rail's People: the row is its first sixteen
  const people = $derived(peopleRanking.order(everyone).slice(0, MAX_FACES));
  const more = $derived(everyone.length - people.length);

  $effect(() => {
    const config = buildAlbumDetailFilterConfig(albumId);
    let current = true;
    // the faces wait for the order (2 s at most), so none moves once they show
    void Promise.all([config.baselineProvider?.(), peopleRanking.load()])
      .then(([result]) => {
        if (current) {
          everyone = result?.people ?? [];
        }
      })
      .catch(() => {
        if (current) {
          everyone = [];
        }
      });
    return () => {
      current = false;
    };
  });

  // the phone's row fades at an end only where there is more to scroll to, as the bar's years do
  let track = $state<HTMLElement>();
  let atStart = $state(true);
  let atEnd = $state(true);
  const edges = () => {
    if (!track) {
      return;
    }
    // scrollLeft runs negative from the start in a right-to-left page
    const scrolled = Math.abs(track.scrollLeft);
    atStart = scrolled <= 1;
    atEnd = scrolled + track.clientWidth >= track.scrollWidth - 1;
  };
  $effect(() => {
    void people.length;
    if (!track || typeof ResizeObserver === 'undefined') {
      edges();
      return;
    }
    const resized = new ResizeObserver(edges);
    resized.observe(track);
    edges();
    return () => resized.disconnect();
  });

  // ---- a face's name over it, on a phone, where the row shows the faces alone: while the face holds the keyboard's
  // focus, or for a moment once a finger has rested on it (a long press, which then toggles nothing). It is drawn on
  // <body> (portal) so neither the row's scroll nor the timeline's scrolling box cuts it. While anything scrolls the
  // keyboard's follows its face (a face tabbed to off the row's edge scrolls the row to it) and a finger's goes.
  const LONG_PRESS_MS = 450;
  const LABEL_HOLD_MS = 1500;
  // a finger that moves this far is scrolling, not resting
  const SLOP_PX = 8;
  const EDGE_PX = 8;
  let label = $state<{ id: string; name: string; face: DOMRect; button: HTMLElement; byKeyboard: boolean }>();
  let labelBox = $state<HTMLElement>();
  let labelAt = $state<{ left: number; top: number }>();
  let press: { pointer: number; x: number; y: number; timer: ReturnType<typeof setTimeout> } | undefined;
  // the last press showed the name: its click leaves the album as it was
  let pressShown = false;
  let lastPointer = 'mouse';
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  const faceOf = (button: HTMLElement) =>
    (button.querySelector('img, .ws-album-person-initial') ?? button).getBoundingClientRect();
  const showLabel = (person: Person, button: HTMLElement, byKeyboard: boolean) => {
    clearTimeout(hideTimer);
    label = { id: person.id, name: person.name, face: faceOf(button), button, byKeyboard };
  };
  const hideLabel = () => {
    clearTimeout(hideTimer);
    label = undefined;
  };
  const followLabel = () => {
    if (label?.byKeyboard && document.activeElement === label.button) {
      label = { ...label, face: faceOf(label.button) };
    } else {
      hideLabel();
    }
  };
  const endPress = () => {
    if (press) {
      clearTimeout(press.timer);
      press = undefined;
    }
  };

  // over the face, kept a little inside the window; under it where the window's top leaves no room
  $effect(() => {
    if (!label || !labelBox) {
      labelAt = undefined;
      return;
    }
    const { face } = label;
    const { offsetWidth: width, offsetHeight: height } = labelBox;
    const left = Math.max(EDGE_PX, Math.min(face.left + face.width / 2 - width / 2, innerWidth - EDGE_PX - width));
    const above = face.top - height - 6;
    labelAt = { left, top: above >= EDGE_PX ? above : face.bottom + 6 };
  });
  const labelShown = $derived(label !== undefined);
  $effect(() => {
    if (!labelShown) {
      return;
    }
    addEventListener('scroll', followLabel, { capture: true, passive: true });
    addEventListener('resize', followLabel, { passive: true });
    return () => {
      removeEventListener('scroll', followLabel, { capture: true });
      removeEventListener('resize', followLabel);
    };
  });
  $effect(() => () => {
    endPress();
    clearTimeout(hideTimer);
  });

  const onPointerDown = (event: PointerEvent, person: Person) => {
    pressShown = false;
    lastPointer = event.pointerType;
    endPress();
    if (event.pointerType === 'mouse' || !mediaQueryManager.isPhone) {
      return;
    }
    const button = event.currentTarget as HTMLElement;
    press = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      timer: setTimeout(() => {
        press = undefined;
        pressShown = true;
        showLabel(person, button, false);
      }, LONG_PRESS_MS),
    };
  };
  const onPointerMove = (event: PointerEvent) => {
    if (
      press &&
      event.pointerId === press.pointer &&
      Math.hypot(event.clientX - press.x, event.clientY - press.y) > SLOP_PX
    ) {
      endPress();
    }
  };
  const onPointerEnd = () => {
    endPress();
    if (pressShown) {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hideLabel, LABEL_HOLD_MS);
    }
  };
  const onClick = (person: Person) => {
    if (pressShown) {
      pressShown = false;
      return;
    }
    onToggle(person);
  };
  // a finger resting on a face would open the browser's own menu for its picture
  const onContextMenu = (event: MouseEvent) => {
    if (lastPointer !== 'mouse') {
      event.preventDefault();
    }
  };
  // what the keyboard reaches comes wholly into the row, clear of its faded ends (the browser scrolls only to what is
  // wholly out of view), and a face shows its name
  const byKeyboard = (event: FocusEvent) => {
    const button = event.currentTarget as HTMLElement;
    if (!mediaQueryManager.isPhone || !button.matches(':focus-visible')) {
      return;
    }
    button.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    return button;
  };
  const onFocus = (event: FocusEvent, person: Person) => {
    const button = byKeyboard(event);
    if (button) {
      showLabel(person, button, true);
    }
  };
  const onBlur = (person: Person) => {
    if (label?.id === person.id) {
      hideLabel();
    }
  };

  const initial = (name: string) => name.trim().charAt(0).toLocaleUpperCase();
</script>

{#if people.length > 0}
  <div
    class="ws-album-people"
    role="group"
    aria-label={$t('people')}
    data-start={atStart ? '' : undefined}
    data-end={atEnd ? '' : undefined}
  >
    <div class="ws-album-people-track" bind:this={track} onscroll={edges}>
      {#each people as person (person.id)}
        <button
          type="button"
          class="ws-album-person"
          aria-pressed={selected.includes(person.id)}
          title={person.name}
          onclick={() => onClick(person)}
          onpointerdown={(event) => onPointerDown(event, person)}
          onpointermove={onPointerMove}
          onpointerup={onPointerEnd}
          onpointercancel={onPointerEnd}
          oncontextmenu={onContextMenu}
          onfocus={(event) => onFocus(event, person)}
          onblur={() => onBlur(person)}
        >
          {#if person.thumbnailUrl}
            <img src={person.thumbnailUrl} alt="" loading="lazy" draggable="false" />
          {:else}
            <!-- a person without a face to show: a quiet ring with the initial, as the bar's account -->
            <span class="ws-album-person-initial" aria-hidden="true">{initial(person.name)}</span>
          {/if}
          <span class="ws-album-person-name">{person.name}</span>
        </button>
      {/each}
      {#if more > 0}
        {@const moreLabel = $t('album_people_more', { values: { count: more } })}
        {#if onMore}
          <button
            type="button"
            class="ws-album-people-more"
            aria-label={moreLabel}
            title={moreLabel}
            onclick={onMore}
            onfocus={byKeyboard}
          >
            <span>+{more.toLocaleString($locale)}</span>
          </button>
        {:else}
          <span class="ws-album-people-more" role="img" aria-label={moreLabel}>
            <span aria-hidden="true">+{more.toLocaleString($locale)}</span>
          </span>
        {/if}
      {/if}
    </div>
  </div>
{/if}

{#if label && people.length > 0}
  <span
    class="ws-album-people-label"
    aria-hidden="true"
    data-testid="album-person-label"
    use:portal
    bind:this={labelBox}
    style:left={labelAt ? `${labelAt.left}px` : undefined}
    style:top={labelAt ? `${labelAt.top}px` : undefined}
    style:visibility={labelAt ? undefined : 'hidden'}>{label.name}</span
  >
{/if}

<style>
  /* ---- wider screens: chips, the face and the name ---- */
  .ws-album-people-track {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .ws-album-person {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    height: 2rem;
    padding-inline: 0.125rem 0.625rem;
    border-radius: var(--ws-radius);
    font-size: var(--ws-text-meta);
    font-weight: 500;
    color: var(--immich-ui-dark);
    box-shadow: inset 0 0 0 1px var(--ws-hairline);
    transition: background-color 120ms;
  }
  .ws-album-person:hover {
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, transparent);
  }
  .ws-album-person[aria-pressed='true'] {
    background: var(--immich-ui-dark);
    color: var(--immich-ui-light);
    box-shadow: none;
  }
  .ws-album-person:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }
  /* a face stays round */
  img,
  .ws-album-person-initial {
    flex: none;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 9999px;
  }
  img {
    object-fit: cover;
    pointer-events: none;
  }
  .ws-album-person-initial {
    display: grid;
    place-items: center;
    font-size: var(--ws-text-meta);
    font-weight: 600;
    box-shadow: inset 0 0 0 1px color-mix(in oklab, currentColor 38%, transparent);
  }
  .ws-album-person-name {
    white-space: nowrap;
  }
  /* +N: the people past the last face, in data type in a hairline frame, as the Shared feed counts the rest */
  .ws-album-people-more {
    display: inline-grid;
    place-items: center;
    min-width: 2rem;
    height: 2rem;
    padding-inline: 0.375rem;
    border-radius: var(--ws-radius);
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-muted);
    box-shadow: inset 0 0 0 1px var(--ws-hairline);
    transition:
      background-color 120ms,
      color 120ms;
  }
  button.ws-album-people-more:hover {
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, transparent);
    color: var(--immich-ui-dark);
  }
  button.ws-album-people-more:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }

  /* ---- a phone: one row of faces that scrolls sideways. Each face is a 40px square target on the gutter with the 32px
     face in its middle, as an icon sits in its button; the row stays inside the details' box, since any overflow there
     would let the whole timeline scroll sideways. The name stays the button's, out of sight (and over the face while it
     has the keyboard's focus or a finger rests on it); pressed, a face is ringed in ink past a hair of ground, inside
     its target ---- */
  @media (max-width: 639px) {
    .ws-album-people {
      width: 100%;
    }
    .ws-album-people-track {
      flex-wrap: nowrap;
      gap: 0;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      scrollbar-width: none;
      --fade: 1.5rem;
      scroll-padding-inline: var(--fade);
      mask-image: linear-gradient(
        to right,
        transparent,
        black var(--fade),
        black calc(100% - var(--fade)),
        transparent
      );
    }
    .ws-album-people-track::-webkit-scrollbar {
      display: none;
    }
    .ws-album-people[data-start] .ws-album-people-track {
      mask-image: linear-gradient(to right, black calc(100% - var(--fade)), transparent);
    }
    .ws-album-people[data-end] .ws-album-people-track {
      mask-image: linear-gradient(to right, transparent, black var(--fade));
    }
    .ws-album-people[data-start][data-end] .ws-album-people-track {
      mask-image: none;
    }
    .ws-album-people-track:dir(rtl) {
      mask-image: linear-gradient(to left, transparent, black var(--fade), black calc(100% - var(--fade)), transparent);
    }
    .ws-album-people[data-start] .ws-album-people-track:dir(rtl) {
      mask-image: linear-gradient(to left, black calc(100% - var(--fade)), transparent);
    }
    .ws-album-people[data-end] .ws-album-people-track:dir(rtl) {
      mask-image: linear-gradient(to left, transparent, black var(--fade));
    }
    .ws-album-people[data-start][data-end] .ws-album-people-track:dir(rtl) {
      mask-image: none;
    }
    .ws-album-person,
    .ws-album-people-more {
      flex: none;
      display: grid;
      place-items: center;
      width: 2.5rem;
      min-width: 0;
      height: 2.5rem;
      padding: 0;
      border-radius: 0;
      background: none;
      box-shadow: none;
      -webkit-touch-callout: none;
      user-select: none;
    }
    /* the name out of sight is the button's own, inside it */
    .ws-album-person {
      position: relative;
    }
    /* +N keeps its count whole however long it runs */
    .ws-album-people-more {
      width: auto;
      min-width: 2.5rem;
      padding-inline: 0.25rem;
    }
    .ws-album-person:hover,
    .ws-album-person[aria-pressed='true'],
    button.ws-album-people-more:hover {
      background: none;
    }
    .ws-album-person:focus-visible,
    button.ws-album-people-more:focus-visible {
      outline: none;
    }
    img,
    .ws-album-person-initial {
      width: 2rem;
      height: 2rem;
      color: var(--immich-ui-dark);
      transition: box-shadow 120ms;
    }
    .ws-album-person[aria-pressed='true'] :is(img, .ws-album-person-initial) {
      box-shadow:
        0 0 0 2px var(--immich-ui-light),
        0 0 0 4px var(--immich-ui-dark);
    }
    .ws-album-person:focus-visible :is(img, .ws-album-person-initial) {
      outline: var(--ws-border) solid var(--ws-accent);
      outline-offset: 2px;
    }
    .ws-album-person-name {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
    .ws-album-people-more > span {
      display: grid;
      place-items: center;
      min-width: 2rem;
      height: 2rem;
      padding-inline: 0.25rem;
      border-radius: var(--ws-radius);
      box-shadow: inset 0 0 0 1px var(--ws-hairline);
    }
    button.ws-album-people-more:focus-visible > span {
      outline: var(--ws-border) solid var(--ws-accent);
      outline-offset: 2px;
    }
  }
  @media (max-width: 639px) and (hover: hover) {
    .ws-album-person:hover:not([aria-pressed='true']) :is(img, .ws-album-person-initial) {
      box-shadow:
        0 0 0 2px var(--immich-ui-light),
        0 0 0 4px color-mix(in oklab, var(--immich-ui-dark) 24%, transparent);
    }
    button.ws-album-people-more:hover > span {
      background: color-mix(in oklab, var(--immich-ui-dark) 6%, transparent);
      color: var(--immich-ui-dark);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    img,
    .ws-album-person-initial {
      transition: none;
    }
  }

  /* the name over a face: a name tag in the tooltip's grammar (ink fill, the ground's text), floating, so it takes the
     popup shadow */
  .ws-album-people-label {
    position: fixed;
    z-index: 70;
    max-width: calc(100vw - 1rem);
    padding: 0.25rem 0.5rem;
    overflow: hidden;
    border-radius: var(--ws-radius);
    background: var(--immich-ui-dark);
    color: var(--immich-ui-light);
    font-size: var(--ws-text-meta);
    font-weight: 600;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
    pointer-events: none;
    box-shadow: 0 12px 32px -8px rgb(0 0 0 / 0.28);
  }
</style>
