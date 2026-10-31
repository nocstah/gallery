import type { MessageFormatter } from 'svelte-i18n';
import { DEFAULT_TITLE, type SeriesCard } from './series-api';
import { seriesDate, seriesPlainDate } from './series-days';

// Local Omarchy layer: a series as From the beginning names it (gallery/series): on its card in the list and at the
// head of its own page. What it is made from (the whole library, or its album by name: the owner's alone, never on the
// family page), its span, where it stands, the days its plan still holds and its family link, each in words from the
// page's own keys, with the album's notes when its smart rule stopped or Gallery no longer has it.

type Card = Pick<SeriesCard, 'source'>;

/** what it is made from: "The whole library", the album's name, or "An album that is gone" */
export const sourceName = (card: Card, $t: MessageFormatter): string => {
  const { source } = card;
  if (source.kind === 'library') {
    return $t('memory_series_whole_library');
  }
  return source.name || $t(source.gone ? 'memory_series_album_gone_unnamed' : 'memory_series_new_album');
};

/** its span of days, when it has one: "Mar 1, 2003 to Dec 31, 2010", "From …", "Until …" */
export const spanWords = (
  card: Pick<SeriesCard, 'span_from' | 'span_to'>,
  $t: MessageFormatter,
  locale?: string,
): string | undefined => {
  const from = card.span_from ? seriesPlainDate(card.span_from, locale) : undefined;
  const to = card.span_to ? seriesPlainDate(card.span_to, locale) : undefined;
  if (from && to) {
    return $t('memory_series_span_both', { values: { from, to } });
  }
  if (from) {
    return $t('memory_series_span_since', { values: { date: from } });
  }
  return to ? $t('memory_series_span_until', { values: { date: to } }) : undefined;
};

/** where it stands: Planning, Starts on <day 1>, Live, Off, Ended */
export const statusWords = (
  card: Pick<SeriesCard, 'status' | 'starts_on'>,
  $t: MessageFormatter,
  locale?: string,
): string => {
  switch (card.status) {
    case 'starts': {
      return card.starts_on
        ? $t('memory_series_starts_on', { values: { date: seriesDate(card.starts_on, locale) } })
        : $t('memory_series_status_planning');
    }
    case 'live': {
      return $t('memory_series_status_live');
    }
    case 'off': {
      return $t('memory_series_status_off');
    }
    case 'ended': {
      return $t('memory_series_status_ended');
    }
    default: {
      return $t('memory_series_status_planning');
    }
  }
};

/** the days its plan still holds, or that the story has reached today; nothing before the first plan */
export const daysLeftWords = (card: Pick<SeriesCard, 'remaining'>, $t: MessageFormatter): string | undefined => {
  if (card.remaining === null || card.remaining === undefined) {
    return undefined;
  }
  return card.remaining > 0
    ? $t('memory_series_days_left', { values: { count: card.remaining } })
    : $t('memory_series_reached_today');
};

/** its family link: on (made, live or day 1 ahead), none yet, or off */
export const linkWords = (card: Pick<SeriesCard, 'status' | 'link_id'>, $t: MessageFormatter): string => {
  if (card.status === 'planning') {
    return $t('memory_series_link_none');
  }
  const on = card.status === 'live' || card.status === 'starts' || (card.status === 'ended' && !!card.link_id);
  return $t(on ? 'memory_series_link_on' : 'memory_series_link_off');
};

/** a note on its album: that its smart rule no longer keeps it filled, or that Gallery no longer has it */
export const albumNote = (card: Card, $t: MessageFormatter): string | undefined => {
  const { source } = card;
  if (source.kind !== 'album') {
    return undefined;
  }
  if (source.gone) {
    return $t('memory_series_album_gone');
  }
  return source.updating ? undefined : $t('memory_series_album_stopped');
};

/** its family page's title, when the owner gave it one of its own */
export const publicTitle = (card: Pick<SeriesCard, 'name'>, $t: MessageFormatter): string | undefined =>
  card.name && card.name !== DEFAULT_TITLE
    ? $t('memory_series_on_family_page', { values: { title: card.name } })
    : undefined;

/** whether deleting it ends a family link: one Gallery may still have, the one there is or an older one */
export const hasFamilyLink = (card: Pick<SeriesCard, 'links' | 'link_id'>): boolean =>
  !!card.link_id || card.links.length > 0;

/** the family links to delete in Gallery before Curator lets the series go: the one there is and every older one */
export const linksOf = (card: Pick<SeriesCard, 'links' | 'link_id'>): string[] => [
  ...new Set([...(card.link_id ? [card.link_id] : []), ...card.links]),
];
