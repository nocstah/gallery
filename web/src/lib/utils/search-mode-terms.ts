// Local Omarchy layer: how a search mode of the Ctrl+K palette (smart, filename, description, OCR) reads and writes
// search terms. The palette searches by these fields and the search page's field (components/omarchy/
// SearchBarQuery.svelte) edits them, so both read this one map instead of keeping a copy each.
import type { MetadataSearchDto, SmartSearchDto } from '@immich/sdk';
import type { SearchMode } from '$lib/managers/global-search-manager.svelte';

/** The modes that search by a text: every mode but Ask, whose questions Curator answers on its own page. */
export type TextSearchMode = Exclude<SearchMode, 'ask'>;
/** The modes that match a field's text rather than searching by meaning. */
export type FieldSearchMode = Exclude<TextSearchMode, 'smart'>;

type TextTerms = Pick<SmartSearchDto, 'query'> & Pick<MetadataSearchDto, 'originalFileName' | 'description' | 'ocr'>;

/** In the palette's order, which Ctrl+/ cycles through. */
export const textSearchModes: readonly TextSearchMode[] = ['smart', 'metadata', 'description', 'ocr'];

/** The field a mode's text goes in: smart searches by meaning (`query`), the others match that field's text. */
export const searchModeField: Readonly<Record<TextSearchMode, keyof TextTerms>> = {
  smart: 'query',
  metadata: 'originalFileName',
  description: 'description',
  ocr: 'ocr',
};

export const isTextSearchMode = (mode: unknown): mode is TextSearchMode =>
  textSearchModes.includes(mode as TextSearchMode);

/** The text of a field mode as the term it searches by. */
export const fieldSearchTerms = (
  mode: FieldSearchMode,
  text: string,
): Pick<MetadataSearchDto, 'originalFileName' | 'description' | 'ocr'> => {
  switch (mode) {
    case 'metadata': {
      return { originalFileName: text };
    }
    case 'description': {
      return { description: text };
    }
    case 'ocr': {
      return { ocr: text };
    }
  }
};

/** Which mode and text a set of terms searches by (the first text field, in the palette's order); none for terms
 * that only filter (a place, a person, a photo to find others like). */
export const getSearchModeText = (terms: TextTerms): { mode: TextSearchMode; text: string } | undefined => {
  for (const mode of textSearchModes) {
    const value = terms[searchModeField[mode]];
    if (typeof value === 'string' && value.trim()) {
      return { mode, text: value };
    }
  }
  return undefined;
};

const textFields = new Set<string>(Object.values(searchModeField));

/**
 * The terms searching `text` in `mode`, keeping every other term. The text replaces whatever text the terms searched
 * by before, and a photo to find others like (`queryAssetId`) too, since a typed text takes over from it (the server
 * reads `query` first). An empty text only clears the text.
 */
export const withSearchModeText = <T extends TextTerms & Pick<SmartSearchDto, 'queryAssetId'>>(
  terms: T,
  mode: TextSearchMode,
  text: string,
): T => {
  const trimmed = text.trim();
  const kept = Object.fromEntries(
    Object.entries(terms).filter(([key]) => !textFields.has(key) && !(trimmed && key === 'queryAssetId')),
  ) as T;
  if (!trimmed) {
    return kept;
  }
  return { ...kept, ...(mode === 'smart' ? { query: trimmed } : fieldSearchTerms(mode, trimmed)) };
};
