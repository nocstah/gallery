import { render, screen, waitFor } from '@testing-library/svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import SmartAlbumBadge from '$lib/components/curator/SmartAlbumBadge.svelte';
import SuggestionVisual from '$lib/components/curator/SuggestionVisual.svelte';
import { curator, type SmartAlbum, type Suggestion } from '$lib/utils/curator';

// Local Omarchy layer: the smart albums Curator proposes (jobs/smartalbums.py). An album of people seen together
// shows their faces on its inbox card; a media type's album has no Photos page search behind it to edit.

vi.mock('$lib/utils/curator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/utils/curator')>()),
  curator: { smartForAlbum: vi.fn(), smartStop: vi.fn() },
}));

const card = (payload: Record<string, unknown>, photos: number): Suggestion => ({
  id: 1,
  kind: 'smart.create',
  target_id: 'people:a+b',
  title: 'Anna and Ben',
  detail: '216 photos and 9 videos together · 2016–2026',
  asset_ids: Array.from({ length: photos }, (_, n) => `photo-${n}`),
  payload,
  confidence: null,
  status: 'pending',
  model: 'smart-proposals@1',
  error: null,
  created_at: '2026-10-15T03:00:00Z',
});

const smart = (rule: Partial<SmartAlbum['rule']>): SmartAlbum => ({
  id: 3,
  album_id: 'album-1',
  name: 'Selfies',
  rule: { search: {}, strictness: 'normal', filters: {}, ...rule },
  count: 697,
  excluded: 0,
  synced_at: null,
});

beforeAll(async () => {
  register('en-US', () => import('$i18n/en.json'));
  await init({ fallbackLocale: 'en-US', initialLocale: 'en-US' });
  await waitLocale('en-US');
});

describe('a smart album card', () => {
  it('shows the people together before photos of them', () => {
    const { container } = render(SuggestionVisual, {
      suggestion: card({ name: 'Anna and Ben', person_ids: ['anna', 'ben'] }, 6),
    });
    const faces = [...container.querySelectorAll('img.visual-face')].map((img) => img.getAttribute('src'));
    expect(faces).toEqual(['/api/people/anna/thumbnail', '/api/people/ben/thumbnail']);
    expect(container.querySelectorAll('a.visual-tile')).toHaveLength(4);
  });

  it('shows only photos for a media type', () => {
    const { container } = render(SuggestionVisual, {
      suggestion: card({ name: 'Selfies', rule: { media: 'selfies' } }, 6),
    });
    expect(container.querySelectorAll('img.visual-face')).toHaveLength(0);
    expect(container.querySelectorAll('a.visual-tile')).toHaveLength(6);
  });
});

describe('the smart album badge', () => {
  it('offers to edit the search behind a saved search', async () => {
    vi.mocked(curator.smartForAlbum).mockResolvedValue(
      smart({
        search: { personIds: ['anna', 'ben'] },
        filters: { url: '/photos?people=person:anna,person:ben' },
      }),
    );
    render(SmartAlbumBadge, { albumId: 'album-1' });
    expect(await screen.findByText('Edit search')).toBeInTheDocument();
  });

  it('only offers to stop a media type, which has no search to edit', async () => {
    vi.mocked(curator.smartForAlbum).mockResolvedValue(smart({ media: 'selfies' }));
    render(SmartAlbumBadge, { albumId: 'album-1' });
    expect(await screen.findByText('Stop updating')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Edit search')).not.toBeInTheDocument());
  });
});
