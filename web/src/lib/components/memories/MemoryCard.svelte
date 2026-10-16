<script lang="ts">
  import { MemoryType } from '@immich/sdk';
  import { Icon, type CarouselImageItem } from '@immich/ui';
  import { mdiCakeVariant, mdiHeart } from '@mdi/js';
  import BirthdayConfetti from './BirthdayConfetti.svelte';

  type Props = {
    item: MemoryCardItem;
    class?: string;
  };

  type MemoryCardItem = CarouselImageItem & { isSaved?: boolean; type?: MemoryType; subtitle?: string };

  const { item, class: className = '' }: Props = $props();

  const isBirthday = $derived(item.type === MemoryType.Birthday);

  let confettiCount = $state(0);

  const [flamePath, bottomLayerPath, topLayerPath] = mdiCakeVariant.split(/(?=M)/, 3);
</script>

<!-- Local Omarchy layer: a memory is a tile like a photo's (DESIGN.md, Memories): its title of facts in the display
     face and its line in data type on the caption scrim, the accent's inset border for focus and the pointer. -->
<a
  class="ws-memory-card group relative me-2 inline-block aspect-3/4 h-54 rounded-xl last:me-0 max-md:h-37.5 md:me-4 md:aspect-4/3 xl:aspect-video {className}"
  href={item.href}
  onmouseenter={() => isBirthday && confettiCount++}
>
  {#if item.src}
    <img class="size-full rounded-xl object-cover" src={item.src} alt={item.alt ?? item.title} draggable="false" />
  {/if}
  {#if item.isSaved}
    <div class="absolute inset-s-2 top-2 p-1">
      <Icon data-icon-favorite icon={mdiHeart} size="32" class="text-white" />
    </div>
  {/if}
  <div class="ws-memory-card-scrim absolute inset-s-0 top-0 size-full rounded-xl"></div>
  <!-- Gallery: a wrapper so a subtitle can stack under the title. The rule engine emits rule-aware subtitles (e.g.
       recent-trip's "12 photos over 3 days"); upstream's card renders the title only. Only the memories index passes
       one. -->
  <div class="absolute inset-s-4 inset-e-4 bottom-3">
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
  /* the caption scrim (black 55% to nothing) under the words, so they read on any photo */
  .ws-memory-card-scrim {
    background: linear-gradient(to top, rgb(0 0 0 / 0.55), rgb(0 0 0 / 0.12) 45%, transparent 70%);
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
