import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import PhotoBookModal from '$lib/modals/PhotoBookModal.svelte';

// Local Omarchy layer: the photo book dialog (managers/photo-book-manager) answers with the title, about how many
// photos and, for a year's book, the year; the title follows the year until it is typed over.

// Drain bits-ui Modal's deferred body-scroll-lock cleanup before happy-dom tears down `document`.
afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));
});

const years = [
  { year: 2025, count: 2956 },
  { year: 2024, count: 2172 },
];

describe('PhotoBookModal', () => {
  it("answers an album's book with the title as typed, trimmed, and the photos asked for", async () => {
    const onClose = vi.fn();
    render(PhotoBookModal, { title: 'Vang Vieng, Laos', photos: 27, onClose });
    const title = screen.getByRole('textbox');
    expect(title).toHaveValue('Vang Vieng, Laos');
    expect(screen.getByRole('spinbutton')).toHaveValue(27);
    expect(screen.queryByRole('button', { name: 'year' })).not.toBeInTheDocument();

    await userEvent.clear(title);
    await userEvent.type(title, '  Laos, 2015  ');
    await userEvent.click(screen.getByRole('button', { name: 'photo_book_make' }));

    expect(onClose).toHaveBeenCalledWith({ title: 'Laos, 2015', photos: 27, year: undefined });
  });

  it('takes only as many photos as a book can hold, and its usual number when left empty', async () => {
    const onClose = vi.fn();
    render(PhotoBookModal, { title: 'Trip', onClose });
    const photos = screen.getByRole('spinbutton');
    const make = screen.getByRole('button', { name: 'photo_book_make' });
    expect(photos).toHaveValue(120);

    await userEvent.clear(photos);
    await userEvent.type(photos, '1000');
    await userEvent.click(make);
    expect(onClose).not.toHaveBeenCalled(); // the field says what it takes

    await userEvent.clear(photos);
    await userEvent.type(photos, '300');
    await userEvent.click(make);
    await userEvent.clear(photos);
    await userEvent.click(make);
    expect(onClose.mock.calls.map(([choice]) => choice.photos)).toEqual([300, 120]);
  });

  it("answers a year's book with the year, and the title follows it until typed over", async () => {
    const onClose = vi.fn();
    render(PhotoBookModal, { title: '2025', photos: 150, years, year: 2025, onClose });
    const year = screen.getByRole('button', { name: 'year' });
    expect(year).toHaveTextContent('2025 · items_count');

    await userEvent.click(year);
    await userEvent.click(await screen.findByRole('option', { name: '2024 · items_count' }));
    expect(screen.getByRole('textbox')).toHaveValue('2024');

    await userEvent.clear(screen.getByRole('textbox'));
    await userEvent.type(screen.getByRole('textbox'), 'Our year');
    await userEvent.click(year);
    await userEvent.click(await screen.findByRole('option', { name: '2025 · items_count' }));
    expect(screen.getByRole('textbox')).toHaveValue('Our year');

    await userEvent.click(screen.getByRole('button', { name: 'photo_book_make' }));
    expect(onClose).toHaveBeenCalledWith({ title: 'Our year', photos: 150, year: 2025 });
  });

  it('closes without an answer on cancel', async () => {
    const onClose = vi.fn();
    render(PhotoBookModal, { title: 'Trip', onClose });
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledWith();
  });
});
