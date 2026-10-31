import type { MessageFormatter } from 'svelte-i18n';
import { albumSource, dayFromToday, seriesCard } from '@test-data/factories/series-factory';
import {
  albumNote,
  daysLeftWords,
  hasFamilyLink,
  linksOf,
  linkWords,
  publicTitle,
  sourceName,
  spanWords,
  statusWords,
} from './series-cards';
import { seriesDate, seriesPlainDate } from './series-days';

// Local Omarchy layer: a series as its card and its page name it (gallery/series): each fact in the page's own words,
// with what each word is given (a stand-in formatter writes the key and its values). Synthetic names and ids only.

const $t = ((id: string, options?: { values?: Record<string, unknown> }) =>
  options?.values ? `${id} ${JSON.stringify(options.values)}` : id) as MessageFormatter;

describe('what a series is made from', () => {
  it('is the whole library, an album by its name, or an album that is gone', () => {
    expect(sourceName(seriesCard(), $t)).toBe('memory_series_whole_library');
    expect(sourceName(seriesCard({ source: albumSource() }), $t)).toBe('Riverton walks');
    expect(sourceName(seriesCard({ source: albumSource({ name: null, gone: true }) }), $t)).toBe(
      'memory_series_album_gone_unnamed',
    );
    // a name kept for an album that is gone still names it
    expect(sourceName(seriesCard({ source: albumSource({ gone: true }) }), $t)).toBe('Riverton walks');
  });

  it('notes an album that no longer updates, or that is gone', () => {
    expect(albumNote(seriesCard(), $t)).toBeUndefined();
    expect(albumNote(seriesCard({ source: albumSource() }), $t)).toBeUndefined();
    expect(albumNote(seriesCard({ source: albumSource({ updating: false }) }), $t)).toBe('memory_series_album_stopped');
    expect(albumNote(seriesCard({ source: albumSource({ updating: false, gone: true }) }), $t)).toBe(
      'memory_series_album_gone',
    );
  });
});

describe('its span', () => {
  it('says both ends, one of them, or nothing, as dates in the reader’s language', () => {
    const from = seriesPlainDate('2003-03-01', 'en');
    const to = seriesPlainDate('2010-12-31', 'en');
    expect(spanWords(seriesCard({ span_from: '2003-03-01', span_to: '2010-12-31' }), $t, 'en')).toBe(
      `memory_series_span_both ${JSON.stringify({ from, to })}`,
    );
    expect(spanWords(seriesCard({ span_from: '2003-03-01' }), $t, 'en')).toBe(
      `memory_series_span_since ${JSON.stringify({ date: from })}`,
    );
    expect(spanWords(seriesCard({ span_to: '2010-12-31' }), $t, 'en')).toBe(
      `memory_series_span_until ${JSON.stringify({ date: to })}`,
    );
    expect(spanWords(seriesCard(), $t, 'en')).toBeUndefined();
  });
});

describe('where it stands', () => {
  it('names each state, and day 1 while it is ahead', () => {
    const day = dayFromToday(3);
    expect(statusWords(seriesCard({ status: 'planning' }), $t)).toBe('memory_series_status_planning');
    expect(statusWords(seriesCard({ status: 'starts', starts_on: day }), $t, 'en')).toBe(
      `memory_series_starts_on ${JSON.stringify({ date: seriesDate(day, 'en') })}`,
    );
    expect(statusWords(seriesCard({ status: 'live' }), $t)).toBe('memory_series_status_live');
    expect(statusWords(seriesCard({ status: 'off' }), $t)).toBe('memory_series_status_off');
    expect(statusWords(seriesCard({ status: 'ended' }), $t)).toBe('memory_series_status_ended');
  });

  it('counts the days its plan holds, says when the story has reached today, and nothing before a plan', () => {
    expect(daysLeftWords(seriesCard({ remaining: 214 }), $t)).toBe(
      `memory_series_days_left ${JSON.stringify({ count: 214 })}`,
    );
    expect(daysLeftWords(seriesCard({ remaining: 0 }), $t)).toBe('memory_series_reached_today');
    expect(daysLeftWords(seriesCard({ remaining: null }), $t)).toBeUndefined();
  });

  it('says whether its family link is on, not made yet, or off', () => {
    expect(linkWords(seriesCard({ status: 'planning' }), $t)).toBe('memory_series_link_none');
    expect(linkWords(seriesCard({ status: 'starts', link_id: 'link-1' }), $t)).toBe('memory_series_link_on');
    expect(linkWords(seriesCard({ status: 'live', link_id: 'link-1' }), $t)).toBe('memory_series_link_on');
    expect(linkWords(seriesCard({ status: 'off' }), $t)).toBe('memory_series_link_off');
    expect(linkWords(seriesCard({ status: 'ended', link_id: 'link-1' }), $t)).toBe('memory_series_link_on');
    expect(linkWords(seriesCard({ status: 'ended' }), $t)).toBe('memory_series_link_off');
  });
});

describe('its family page', () => {
  it('names the title the owner gave it, and leaves Curator’s own unsaid', () => {
    expect(publicTitle(seriesCard(), $t)).toBeUndefined();
    expect(publicTitle(seriesCard({ name: 'Summers at the lake' }), $t)).toBe(
      `memory_series_on_family_page ${JSON.stringify({ title: 'Summers at the lake' })}`,
    );
  });

  it('knows every link to turn off before the series goes: the one there is first, each once', () => {
    expect(linksOf(seriesCard())).toEqual([]);
    expect(hasFamilyLink(seriesCard())).toBe(false);
    expect(linksOf(seriesCard({ link_id: 'link-2', links: ['link-1', 'link-2'] }))).toEqual(['link-2', 'link-1']);
    expect(hasFamilyLink(seriesCard({ links: ['link-1'] }))).toBe(true);
    expect(hasFamilyLink(seriesCard({ link_id: 'link-1' }))).toBe(true);
  });
});
