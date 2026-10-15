import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { BookItem } from '$lib/managers/photo-book-manager.svelte';
import type { BookResult } from '$lib/utils/curator';
import PhotoBookPanel from './PhotoBookPanel.svelte';

// Local Omarchy layer: the photo books panel shows a book's stage while it is made, then its three files to open in a
// new tab or save from Curator, or that it failed with a way to try again; it asks Curator once someone is signed in.

const { books, auth } = vi.hoisted(() => ({
  books: {
    items: [] as BookItem[],
    check: vi.fn(),
    retry: vi.fn(),
    clearDone: vi.fn(),
  },
  auth: { authenticated: true, isSharedLink: false },
}));

vi.mock('$lib/managers/photo-book-manager.svelte', () => ({ photoBooks: books }));
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: auth }));

const result: BookResult = {
  title: 'Exploring temples',
  subtitle: null,
  folder: 'Exploring temples',
  files: {
    book: { name: 'Exploring temples.pdf', size: 45_044_784 },
    cover: { name: 'Exploring temples - cover.pdf', size: 916_826 },
    preview: { name: 'Exploring temples - preview.pdf', size: 3_002_312 },
  },
  pages: 38,
  photos: 100,
  candidates: 156,
  chapters: [],
};

const item = (fields: Partial<BookItem>): BookItem => ({
  key: 'album:a',
  subject: { album_id: 'a' },
  title: 'Exploring temples',
  label: 'Exploring temples',
  photos: 120,
  status: 'making',
  stage: 'waiting',
  done: 0,
  total: 0,
  progress: 0,
  ...fields,
});

beforeEach(() => {
  vi.clearAllMocks();
  books.items = [];
  auth.authenticated = true;
});

describe('PhotoBookPanel', () => {
  it('shows nothing without books, and asks Curator whether it makes them once someone is signed in', () => {
    const { container } = render(PhotoBookPanel);
    expect(container.querySelector('section')).toBeNull();
    expect(books.check).toHaveBeenCalled();
  });

  it('does not ask Curator for a visitor who is not signed in', () => {
    auth.authenticated = false;
    render(PhotoBookPanel);
    expect(books.check).not.toHaveBeenCalled();
  });

  it('shows how far a book has got, page by page', () => {
    books.items = [item({ stage: 'pages', done: 12, total: 38, progress: 0.4 })];
    render(PhotoBookPanel);
    expect(screen.getByRole('region', { name: 'photo_books' })).toBeInTheDocument();
    expect(screen.getByText('Exploring temples')).toBeInTheDocument();
    expect(screen.getByText('photo_book_page_of')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it("offers a finished book's files to open in a new tab or to save", () => {
    books.items = [item({ status: 'ready', stage: 'finishing', progress: 1, jobId: 41, result })];
    render(PhotoBookPanel);
    expect(screen.getByText('photo_book_pages')).toBeInTheDocument();
    for (const [part, label] of [
      ['book', 'photo_book_interior'],
      ['cover', 'photo_book_cover'],
      ['preview', 'photo_book_preview'],
    ]) {
      const open = screen.getByRole('link', { name: `${label}: photo_book_open` });
      expect(open).toHaveAttribute('href', `http://localhost:2290/api/books/41/${part}.pdf`);
      expect(open).toHaveAttribute('target', '_blank');
      const save = screen.getByRole('link', { name: `${label}: download` });
      expect(save).toHaveAttribute('href', `http://localhost:2290/api/books/41/${part}.pdf?download=true`);
    }
  });

  it('says a book failed, why on hover, and tries again', async () => {
    books.items = [item({ status: 'failed', error: 'no photos to print in this album' })];
    render(PhotoBookPanel);
    expect(screen.getByText('failed')).toHaveAttribute('title', 'no photos to print in this album');
    await userEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(books.retry).toHaveBeenCalledWith('album:a');
  });

  it('clears the finished books on close', async () => {
    books.items = [item({})];
    render(PhotoBookPanel);
    await userEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(books.clearDone).toHaveBeenCalled();
  });
});
