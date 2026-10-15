import { describe, expect, it } from 'vitest';
import {
  fieldSearchTerms,
  getSearchModeText,
  isTextSearchMode,
  searchModeField,
  textSearchModes,
  withSearchModeText,
} from './search-mode-terms';

describe('search mode terms', () => {
  it('offers the palette modes that search by a text, in the palette order', () => {
    expect(textSearchModes).toEqual(['smart', 'metadata', 'description', 'ocr']);
    expect(isTextSearchMode('ocr')).toBe(true);
    expect(isTextSearchMode('ask')).toBe(false);
    expect(isTextSearchMode(undefined)).toBe(false);
  });

  it('puts each mode text in its field', () => {
    expect(searchModeField).toEqual({
      smart: 'query',
      metadata: 'originalFileName',
      description: 'description',
      ocr: 'ocr',
    });
    expect(fieldSearchTerms('metadata', 'IMG_1')).toEqual({ originalFileName: 'IMG_1' });
    expect(fieldSearchTerms('description', 'Sapa')).toEqual({ description: 'Sapa' });
    expect(fieldSearchTerms('ocr', 'Latte')).toEqual({ ocr: 'Latte' });
  });

  it('reads the mode and text a search uses, or none for a search by filters only', () => {
    expect(getSearchModeText({ query: 'beach' })).toEqual({ mode: 'smart', text: 'beach' });
    expect(getSearchModeText({ ocr: 'invoice' })).toEqual({ mode: 'ocr', text: 'invoice' });
    expect(getSearchModeText({ originalFileName: 'IMG' })).toEqual({ mode: 'metadata', text: 'IMG' });
    expect(getSearchModeText({ query: '  ' })).toBeUndefined();
    expect(getSearchModeText({})).toBeUndefined();
  });

  it('replaces the text and keeps the other terms', () => {
    expect(withSearchModeText({ query: 'beach', city: 'Berlin' }, 'ocr', ' invoice ')).toEqual({
      city: 'Berlin',
      ocr: 'invoice',
    });
    expect(withSearchModeText({ description: 'old', isFavorite: true }, 'smart', 'sunset')).toEqual({
      isFavorite: true,
      query: 'sunset',
    });
  });

  it('lets a typed text take over from a photo to find others like', () => {
    expect(withSearchModeText({ queryAssetId: 'asset-1', city: 'Berlin' }, 'smart', 'dog')).toEqual({
      city: 'Berlin',
      query: 'dog',
    });
  });

  it('clears only the text for an empty text, keeping a photo to find others like', () => {
    expect(withSearchModeText({ query: 'beach', city: 'Berlin' }, 'smart', '')).toEqual({ city: 'Berlin' });
    expect(withSearchModeText({ queryAssetId: 'asset-1' }, 'smart', ' ')).toEqual({ queryAssetId: 'asset-1' });
  });
});
