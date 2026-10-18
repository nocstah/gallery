<script lang="ts">
  import { MemoryType } from '@immich/sdk';
  import { Icon, type CarouselImageItem } from '@immich/ui';
  import { mdiCakeVariant, mdiHeart } from '@mdi/js';
  import BirthdayConfetti from './BirthdayConfetti.svelte';
  import { CARD_SCRIM, imagePicture, scrimAt, shotShade, textBox, wordsIn, type FilmWords } from './film/film-shade';

  type Props = {
    item: MemoryCardItem;
    class?: string;
  };

  type MemoryCardItem = CarouselImageItem & { isSaved?: boolean; type?: MemoryType; subtitle?: string };

  const { item, class: className = '' }: Props = $props();

  const isBirthday = $derived(item.type === MemoryType.Birthday);

  let confettiCount = $state(0);

  const [flamePath, bottomLayerPath, topLayerPath] = mdiCakeVariant.split(/(?=M)/, 3);

  // Local Omarchy layer: a bright cover lays a shade of its own under the card's words, as the film's photos do
  // (film-shade.ts): its pixels, once loaded, say how bright it is where the title and the line stand, and the shade is
  // the black that brings them to AA there (the title, large, to 3:1; the line to 4.5:1) beyond what the scrim gives
  let card: HTMLElement | undefined = $state();
  let cover: HTMLImageElement | undefined = $state();
  let words: HTMLElement | undefined = $state();
  let width = $state(0);
  let shade = $state(0);
  let reach = $state(0);

  const lookAtCover = () => {
    if (!card || !cover?.complete || !words) {
      return;
    }
    const frame = card.getBoundingClientRect();
    const picture = imagePicture(cover, null);
    if (!picture || frame.width <= 0 || frame.height <= 0) {
      return;
    }
    const lines: FilmWords[] = [];
    let top = frame.bottom;
    for (const element of words.children) {
      const rect = textBox(element);
      if (!rect) {
        continue;
      }
      lines.push(wordsIn(element, rect, frame, scrimAt((frame.bottom - rect.top) / frame.height, CARD_SCRIM)));
      top = Math.min(top, rect.top);
    }
    const still = { scale: 1, x: 0.5, y: 0.5 };
    const shot = { fit: 'fill' as const, ratio: cover.naturalWidth / cover.naturalHeight, from: still, to: still };
    shade = lines.length > 0 ? shotShade(picture, shot, frame.width / frame.height, lines) : 0;
    reach = Math.round(frame.bottom - top);
  };

  // a cover already loaded (from the cache), a card laid out at another size, a new title
  $effect(() => {
    void width;
    void item.title;
    void item.subtitle;
    lookAtCover();
  });
</script>

<!-- Local Omarchy layer: a memory is a tile like a photo's (DESIGN.md, Memories): its title of facts in the display
     face and its line in data type on the caption scrim, the accent's inset border for focus and the pointer. -->
<a
  class="ws-memory-card group relative me-2 inline-block aspect-3/4 h-54 rounded-xl last:me-0 max-md:h-37.5 md:me-4 md:aspect-4/3 xl:aspect-video {className}"
  href={item.href}
  onmouseenter={() => isBirthday && confettiCount++}
  bind:this={card}
  bind:clientWidth={width}
>
  {#if item.src}
    <img
      class="size-full rounded-xl object-cover"
      src={item.src}
      alt={item.alt ?? item.title}
      draggable="false"
      bind:this={cover}
      onload={lookAtCover}
    />
  {/if}
  {#if item.isSaved}
    <div class="absolute inset-s-2 top-2 p-1">
      <Icon data-icon-favorite icon={mdiHeart} size="32" class="text-white" />
    </div>
  {/if}
  <div class="ws-memory-card-scrim absolute inset-s-0 top-0 size-full rounded-xl"></div>
  {#if shade > 0}
    <div
      class="ws-memory-card-shade absolute inset-0 rounded-xl"
      style:--shade={shade}
      style:--reach="{reach}px"
      aria-hidden="true"
    ></div>
  {/if}
  <!-- Gallery: a wrapper so a subtitle can stack under the title. The rule engine emits rule-aware subtitles (e.g.
       recent-trip's "12 photos over 3 days"); upstream's card renders the title only. Only the memories index passes
       one. -->
  <div class="absolute inset-s-4 inset-e-4 bottom-3" bind:this={words}>
    <p class="ws-memory-card-title flex items-center gap-2 whitespace-normal text-white">
      {#if isBirthday}
        <span class="relative">
          <Icon
            data-icon-birthday
            icon={bottomLayerPath}
            size="1.25em"
            class="block transition-colors group-hover:text-logo-blue"
          />
          <Icon
            icon={topLayerPath}
            size="1.25em"
            class="absolute inset-0 transition-colors group-hover:text-logo-pink"
          />
          <span class="flame absolute inset-0">
            <Icon
              icon={flamePath}
              size="1.25em"
              class="block transition-[color,filter] group-hover:text-logo-yellow group-hover:drop-shadow-[0_0_4px_var(--color-logo-yellow)]"
            />
          </span>
          {#key confettiCount}
            {#if confettiCount > 0}
              <span class="absolute inset-s-1/2 top-1/2">
                <BirthdayConfetti
                  amount={40}
                  x={[-0.25, 1]}
                  y={[0.25, 0.9]}
                  size={8}
                  duration={1500}
                  fallDistance="50px"
                />
              </span>
            {/if}
          {/key}
        </span>
        <span class="min-w-0 wrap-break-word">{item.title}</span>
      {:else}
        {item.title}
      {/if}
    </p>
    {#if item.subtitle}
      <p class="ws-memory-card-line">
        {item.subtitle}
      </p>
    {/if}
  </div>
</a>

<style>
  /* the caption scrim (black 55% to nothing) under the words (its stops are film-shade.ts's CARD_SCRIM) */
  .ws-memory-card-scrim {
    background: linear-gradient(to top, rgb(0 0 0 / 0.55), rgb(0 0 0 / 0.12) 45%, transparent 70%);
  }
  /* the bright cover's own shade: flat as high as the words come, fading out a little above them */
  .ws-memory-card-shade {
    pointer-events: none;
    background: linear-gradient(
      to top,
      rgb(0 0 0 / var(--shade)) calc(var(--reach) + 0.25rem),
      rgb(0 0 0 / calc(var(--shade) * 0.5)) calc(var(--reach) + 1.5rem),
      transparent calc(var(--reach) + 3rem)
    );
  }
  .ws-memory-card-title {
    font-family: var(--font-display);
    font-size: var(--ws-text-title);
    font-weight: 750;
    font-stretch: 75%;
    line-height: 1.05;
    letter-spacing: -0.01em;
    word-spacing: 0.06em;
    text-wrap: balance;
  }
  .ws-memory-card-line {
    margin-top: 0.3rem;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: rgb(255 255 255 / 0.82);
  }
  /* focus and the pointer light the card as they light a photo: the accent, inset */
  .ws-memory-card::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: var(--ws-radius);
    pointer-events: none;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.08);
    transition: box-shadow 140ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .ws-memory-card:hover::after,
  .ws-memory-card:focus-visible::after {
    box-shadow: inset 0 0 0 var(--ws-border) var(--ws-accent);
  }
  .ws-memory-card:focus-visible {
    outline: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .ws-memory-card::after {
      transition: none;
    }
  }

  .flame {
    transform-origin: 50% 25%;
  }

  @media (prefers-reduced-motion: no-preference) {
    a:hover .flame {
      animation: flicker 150ms ease-in-out infinite alternate;
    }
  }

  @keyframes flicker {
    to {
      transform: scale(0.9, 1.1);
    }
  }
</style>
