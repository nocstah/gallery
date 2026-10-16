import { render, screen, waitFor } from '@testing-library/svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import AlbumStory from '$lib/components/curator/AlbumStory.svelte';
import StoryText from '$lib/components/curator/StoryText.svelte';
import { curator, type Story } from '$lib/utils/curator';

vi.mock('$lib/utils/curator', () => ({ curator: { story: vi.fn() } }));

const story: Story = {
  text: 'A tall ship docked at a pier in Rawai on 13 January 2013.',
  model: 'gemma4:12b',
  written_at: '2026-10-10T12:45:34Z',
};

beforeAll(async () => {
  register('en-US', () => import('$i18n/en.json'));
  await init({ fallbackLocale: 'en-US', initialLocale: 'en-US' });
  await waitLocale('en-US');
});

beforeEach(() => {
  localStorage.clear();
  vi.mocked(curator.story).mockReset();
});

describe('StoryText', () => {
  it('says the story is written by AI outside the inbox', () => {
    render(StoryText, { story });
    expect(screen.getByText('Story · written by AI')).toBeInTheDocument();
    expect(screen.getByText(story.text)).toBeInTheDocument();
  });

  it("says on a trip album's card what accepting does with it", () => {
    render(StoryText, { story, kind: 'album.create' });
    expect(screen.getByText("Story · becomes the album's description")).toBeInTheDocument();
  });
});

describe('AlbumStory', () => {
  it('shows the story of the event the album holds', async () => {
    vi.mocked(curator.story).mockResolvedValue({ story });
    render(AlbumStory, { albumId: 'a1', description: '' });
    expect(await screen.findByText(story.text)).toBeInTheDocument();
    expect(curator.story).toHaveBeenCalledWith({ album: 'a1' });
  });

  it('stays out when the description already is the story', async () => {
    vi.mocked(curator.story).mockResolvedValue({ story });
    render(AlbumStory, { albumId: 'a1', description: story.text });
    await waitFor(() => expect(curator.story).toHaveBeenCalled());
    expect(screen.queryByText(story.text)).not.toBeInTheDocument();
  });

  it('stays out when the description is the story Curator wrote there', async () => {
    vi.mocked(curator.story).mockResolvedValue({ story });
    render(AlbumStory, { albumId: 'a1', description: `${story.text} (AI)` });
    await waitFor(() => expect(curator.story).toHaveBeenCalled());
    expect(screen.queryByText(story.text)).not.toBeInTheDocument();
  });

  it('stays out when Curator does not answer', async () => {
    vi.mocked(curator.story).mockRejectedValue(new Error('offline'));
    const { container } = render(AlbumStory, { albumId: 'a1', description: '' });
    await waitFor(() => expect(curator.story).toHaveBeenCalled());
    expect(container.textContent?.trim()).toBe('');
  });
});
