import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import AlbumPeopleStrip from '$lib/components/omarchy/AlbumPeopleStrip.svelte';

// Local Omarchy layer: the album's people as faces in its details. A face narrows the album to the person; on a phone
// the faces are one scrolling row, each named for a screen reader, its name shown over it while a finger rests on it
// or it holds the keyboard's focus; more people than the row holds end it with +N, which opens the filters.
const mocks = vi.hoisted(() => ({
  mediaQueryManager: { isPhone: false },
  people: [] as { id: string; name: string; thumbnailUrl?: string }[],
}));

vi.mock('$lib/stores/media-query-manager.svelte', () => ({ mediaQueryManager: mocks.mediaQueryManager }));
vi.mock('$lib/utils/album-filter-config', () => ({
  buildAlbumDetailFilterConfig: () => ({ baselineProvider: () => Promise.resolve({ people: mocks.people }) }),
}));

const person = (index: number) => ({ id: `person:${index}`, name: `Person ${index}`, thumbnailUrl: `/face/${index}` });

const renderStrip = (props: { selected?: string[]; onMore?: () => void } = {}) => {
  const onToggle = vi.fn();
  render(AlbumPeopleStrip, { albumId: 'album-1', selected: props.selected ?? [], onToggle, onMore: props.onMore });
  return { onToggle };
};

const touch = { pointerType: 'touch', pointerId: 3, clientX: 10, clientY: 10 };

describe('AlbumPeopleStrip', () => {
  beforeEach(() => {
    mocks.mediaQueryManager.isPhone = false;
    mocks.people = [person(1), person(2), person(3)];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('names every face and narrows the album to the one pressed', async () => {
    const { onToggle } = renderStrip({ selected: ['person:2'] });

    const group = await screen.findByRole('group', { name: 'people' });
    expect(group).toBeInTheDocument();
    const second = screen.getByRole('button', { name: 'Person 2' });
    expect(second).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Person 1' })).toHaveAttribute('aria-pressed', 'false');

    await fireEvent.click(screen.getByRole('button', { name: 'Person 3' }));
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'person:3' }));
  });

  it('draws nothing for an album without named people', async () => {
    mocks.people = [];
    renderStrip();
    await tick();
    expect(screen.queryByRole('group', { name: 'people' })).not.toBeInTheDocument();
  });

  it('ends the row with +N for the people past its last face, which opens the filters', async () => {
    mocks.people = Array.from({ length: 20 }, (_, index) => person(index + 1));
    const onMore = vi.fn();
    renderStrip({ onMore });

    await screen.findByRole('button', { name: 'Person 16' });
    expect(screen.queryByRole('button', { name: 'Person 17' })).not.toBeInTheDocument();
    const more = screen.getByRole('button', { name: 'album_people_more' });
    expect(more).toHaveTextContent('+4');
    await fireEvent.click(more);
    expect(onMore).toHaveBeenCalledTimes(1);
  });

  it('shows no +N while every person has a face in the row', async () => {
    mocks.people = Array.from({ length: 16 }, (_, index) => person(index + 1));
    renderStrip({ onMore: vi.fn() });
    await screen.findByRole('button', { name: 'Person 16' });
    expect(screen.queryByRole('button', { name: 'album_people_more' })).not.toBeInTheDocument();
  });

  it('draws a person without a face to show as a ring with the initial', async () => {
    mocks.people = [{ id: 'person:9', name: 'yaman' }];
    renderStrip();
    const face = await screen.findByRole('button', { name: 'yaman' });
    expect(face.querySelector('img')).toBeNull();
    expect(face.querySelector('.ws-album-person-initial')).toHaveTextContent('Y');
  });

  describe('on a phone', () => {
    beforeEach(() => {
      mocks.mediaQueryManager.isPhone = true;
    });

    it('shows the name over a face a finger rests on, and that press toggles nothing', async () => {
      vi.useFakeTimers();
      const { onToggle } = renderStrip();
      await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Person 2' })).toBeInTheDocument());
      const face = screen.getByRole('button', { name: 'Person 2' });

      await fireEvent.pointerDown(face, touch);
      vi.advanceTimersByTime(300);
      await tick();
      expect(screen.queryByTestId('album-person-label')).not.toBeInTheDocument();

      vi.advanceTimersByTime(200);
      await tick();
      expect(screen.getByTestId('album-person-label')).toHaveTextContent('Person 2');
      // the name is for the eye: the face is already named for a screen reader
      expect(screen.getByTestId('album-person-label')).toHaveAttribute('aria-hidden', 'true');

      await fireEvent.pointerUp(face, touch);
      await fireEvent.click(face);
      expect(onToggle).not.toHaveBeenCalled();

      // it stays a moment once the finger lifts, then goes
      expect(screen.getByTestId('album-person-label')).toBeInTheDocument();
      vi.advanceTimersByTime(1600);
      await tick();
      expect(screen.queryByTestId('album-person-label')).not.toBeInTheDocument();

      // the next tap is a tap again
      await fireEvent.pointerDown(face, touch);
      await fireEvent.pointerUp(face, touch);
      await fireEvent.click(face);
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('shows the name over the face the keyboard is on, and takes it away with the focus', async () => {
      renderStrip();
      const face = await screen.findByRole('button', { name: 'Person 3' });

      face.focus();
      await tick();
      expect(screen.getByTestId('album-person-label')).toHaveTextContent('Person 3');

      face.blur();
      await tick();
      expect(screen.queryByTestId('album-person-label')).not.toBeInTheDocument();
    });

    it('shows nothing for a finger that moves on (a scroll along the row)', async () => {
      vi.useFakeTimers();
      renderStrip();
      await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Person 1' })).toBeInTheDocument());
      const face = screen.getByRole('button', { name: 'Person 1' });

      await fireEvent.pointerDown(face, touch);
      await fireEvent.pointerMove(face, { ...touch, clientX: 40 });
      vi.advanceTimersByTime(600);
      await tick();
      expect(screen.queryByTestId('album-person-label')).not.toBeInTheDocument();
    });

    it('leaves a mouse press alone: the pointer has the tooltip', async () => {
      vi.useFakeTimers();
      const { onToggle } = renderStrip();
      await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Person 1' })).toBeInTheDocument());
      const face = screen.getByRole('button', { name: 'Person 1' });
      expect(face).toHaveAttribute('title', 'Person 1');

      await fireEvent.pointerDown(face, { ...touch, pointerType: 'mouse' });
      vi.advanceTimersByTime(600);
      await tick();
      expect(screen.queryByTestId('album-person-label')).not.toBeInTheDocument();
      await fireEvent.pointerUp(face, { ...touch, pointerType: 'mouse' });
      await fireEvent.click(face);
      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });

  it('shows no name over a face on a wider screen, whose chips show the names', async () => {
    vi.useFakeTimers();
    renderStrip();
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Person 1' })).toBeInTheDocument());
    await fireEvent.pointerDown(screen.getByRole('button', { name: 'Person 1' }), touch);
    vi.advanceTimersByTime(600);
    await tick();
    expect(screen.queryByTestId('album-person-label')).not.toBeInTheDocument();
    expect(screen.getByText('Person 1')).toBeInTheDocument();
  });
});
