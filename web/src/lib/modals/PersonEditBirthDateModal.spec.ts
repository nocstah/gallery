import { getLocale, setLocale } from '@immich/ui';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach } from 'vitest';
import PersonEditBirthDateModal from './PersonEditBirthDateModal.svelte';

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));
});

describe('PersonEditBirthDateModal', () => {
  it('shows day, month, year even when the browser uses month first', () => {
    const initialLocale = getLocale();
    setLocale('en-US');
    try {
      render(PersonEditBirthDateModal, { props: { birthDate: '1990-06-15', onClose: vi.fn() } });
      const segments = screen.getAllByRole('spinbutton');
      expect(segments.map((segment) => segment.dataset.segment)).toEqual(['day', 'month', 'year']);
      expect(segments.map((segment) => segment.textContent)).toEqual(['15', '06', '1990']);
    } finally {
      setLocale(initialLocale ?? 'default');
    }
  });

  it('submits a typed day/month/year as an ISO date without requiring blur first', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(PersonEditBirthDateModal, { props: { birthDate: null, onSave, onClose } });

    const user = userEvent.setup();
    const [day, month, year] = screen.getAllByRole('spinbutton');
    await user.click(day);
    await user.keyboard('15');
    await user.click(month);
    await user.keyboard('06');
    await user.click(year);
    await user.keyboard('1990');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('1990-06-15'));
    expect(onClose).toHaveBeenCalled();
  });

  it('submits an empty birthdate when clearing an existing date', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(PersonEditBirthDateModal, { props: { birthDate: '1990-06-15', onSave, onClose: vi.fn() } });

    await userEvent.click(screen.getByRole('button', { name: 'clear' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(''));
  });
});
