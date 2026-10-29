import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import MoveUnfinished from './MoveUnfinished.svelte';
import { MOVER_ORIGIN } from './mover';

// Local Omarchy layer: the copies a move left unfinished in this library (gallery/moves, D7): their groups stayed in
// the source, so each is listed with this library's own thumbnail and a way to it. Synthetic ids only.

const names = { source: 'Second', library: 'Main' };
const ids = ['3f1c8a52-8f6e-4e0a-9d7e-2b5f1c9a4d10', '7d2e9b63-1a4c-4f8e-b0d5-6c3a2e1f9b07'];

describe('MoveUnfinished', () => {
  it('lists each unfinished copy with this library’s thumbnail, under its words', () => {
    render(MoveUnfinished, { ids, names });
    expect(screen.getByTestId('move-unfinished')).toHaveTextContent('moves_unfinished_title');
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(ids.map((id) => `/photos/${id}`));
    for (const [index, link] of links.entries()) {
      const source = link.querySelector('img')?.getAttribute('src') ?? '';
      expect(source).toContain(`/assets/${ids[index]}/thumbnail`);
      expect(source).not.toContain(MOVER_ORIGIN);
    }
  });

  it('shows nothing when no copy was left unfinished', () => {
    render(MoveUnfinished, { ids: [], names });
    expect(screen.queryByTestId('move-unfinished')).not.toBeInTheDocument();
  });
});
