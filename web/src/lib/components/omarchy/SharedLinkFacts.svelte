<script lang="ts">
  // Local Omarchy layer: a shared link's line, one muted line in the meta role, in the words every surface tells a link
  // in (utils/shared-link-words): what it is where its name does not say, who can open it, when it ends in calendar
  // days (the day and time in its tooltip, kept on one line, the danger role once it has ended), then what it lets a
  // visitor do beyond looking. The Shared links page's rows, a link in the Shared feed and the Share sheets' link draw
  // it, so a link reads the same wherever it is told (the owner's "one word for one thing", 2026-10-23).
  import { locale } from '$lib/stores/preferences.store';
  import { linkFacts } from '$lib/utils/shared-link-words';
  import type { SharedLinkResponseDto } from '@immich/sdk';
  import { DateTime } from 'luxon';
  import type { Snippet } from 'svelte';
  import { t } from 'svelte-i18n';

  type Props = {
    sharedLink: Pick<
      SharedLinkResponseDto,
      'password' | 'expiresAt' | 'allowDownload' | 'allowUpload' | 'showMetadata'
    >;
    /** what the link is, where its name does not say ("Album", "Memory", "12 photos") */
    what?: string;
    /** whether a visitor can download: the Share sheets say it, where the link has just been made */
    download?: boolean;
    /** the clock the end is read against (a page that keeps one, as the feed does), else now */
    now?: number;
    /** what follows the line on its last row (the Share sheets' Remove expiry) */
    children?: Snippet;
  };

  const { sharedLink, what, download = false, now, children }: Props = $props();

  const facts = $derived(
    linkFacts($t, sharedLink, {
      what,
      download,
      locale: $locale,
      now: now === undefined ? undefined : DateTime.fromMillis(now),
    }),
  );
  // between two facts, as text (spaces and all), so they read apart
  const separator = ' · ';
</script>

<p class="ws-link-facts" data-testid="shared-link-facts">
  {#each facts as fact, index (index)}{#if index > 0}{separator}{/if}<span
      class={{ 'ws-link-end': fact.end, 'ws-link-ended': fact.ended }}
      title={fact.title}>{fact.text}</span
    >{/each}{@render children?.()}
</p>

<style>
  /* who can open it and when it ends, in muted meta */
  .ws-link-facts {
    margin: 0;
    color: var(--immich-ui-muted);
    font-size: var(--ws-text-meta);
    line-height: 1.45;
  }
  /* when it ends keeps its words together ("Ends Nov 17" had broken after "Nov" on a phone) */
  .ws-link-end {
    white-space: nowrap;
  }
  /* a link that has ended says so in the danger role */
  .ws-link-ended {
    color: var(--ws-danger);
  }
</style>
