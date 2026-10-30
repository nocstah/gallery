import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { addMessages } from 'svelte-i18n';
import PeoplePickerModal from '$lib/modals/PeoplePickerModal.svelte';
import SeriesLeaveOut from './SeriesLeaveOut.svelte';

// Local Omarchy layer: who a series leaves out (gallery/series): Curator keeps only person ids, Gallery names them with
// the owner's session, each one once; Add someone opens Kioku's people picker without those already listed, and each
// remove control says whom it takes off. English words here, from the overlay's own strings. Synthetic names only.

const mocks = vi.hoisted(() => ({ show: vi.fn(), getPerson: vi.fn() }));
vi.mock('@immich/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/ui')>()),
  modalManager: { show: mocks.show },
}));
vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  getPerson: mocks.getPerson,
}));

const PEOPLE: Record<string, string> = { 'person-anna': 'Anna', 'person-ben': 'Ben', 'person-unnamed': '' };

beforeAll(() => {
  addMessages('dev', {
    memory_series_leave_out_remove: 'Remove {name}',
    cmdk_unnamed_person: 'Unnamed person',
    unknown: 'Unknown',
  });
});

beforeEach(() => {
  mocks.getPerson.mockImplementation(({ id }: { id: string }) =>
    Object.hasOwn(PEOPLE, id)
      ? Promise.resolve({ id, name: PEOPLE[id], updatedAt: '2026-10-01T00:00:00Z' })
      : Promise.reject(new Error('Not found')),
  );
});

describe('SeriesLeaveOut', () => {
  it('names each person from Gallery once, and each remove control says whom it takes off', async () => {
    const onChange = vi.fn();
    const { rerender } = render(SeriesLeaveOut, {
      props: { ids: ['person-anna', 'person-unnamed', 'person-gone'], onChange },
    });
    expect(await screen.findByRole('button', { name: 'Remove Anna' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Remove Unnamed person' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Remove Unknown' })).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Remove Anna' }));
    expect(onChange).toHaveBeenCalledWith(['person-unnamed', 'person-gone']);

    await rerender({ ids: ['person-unnamed', 'person-gone'], onChange });
    expect(mocks.getPerson).toHaveBeenCalledTimes(3);
  });

  it('adds the people picked, leaving out those already listed', async () => {
    const onChange = vi.fn();
    render(SeriesLeaveOut, { props: { ids: ['person-anna'], onChange } });
    mocks.show.mockResolvedValueOnce([
      { id: 'person-anna', name: 'Anna', updatedAt: '2026-10-01T00:00:00Z' },
      { id: 'person-ben', name: 'Ben', updatedAt: '2026-10-01T00:00:00Z' },
    ]);
    await fireEvent.click(screen.getByRole('button', { name: 'memory_series_leave_out_add' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(['person-anna', 'person-ben']));
    expect(mocks.show).toHaveBeenCalledWith(PeoplePickerModal, { multiple: true, excludedIds: ['person-anna'] });
  });

  it('changes nothing when the picker closes without anyone', async () => {
    const onChange = vi.fn();
    render(SeriesLeaveOut, { props: { ids: [], onChange } });
    mocks.show.mockResolvedValueOnce(undefined);
    await fireEvent.click(screen.getByRole('button', { name: 'memory_series_leave_out_add' }));
    await waitFor(() => expect(mocks.show).toHaveBeenCalledTimes(1));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('waits while a change is saved', () => {
    render(SeriesLeaveOut, { props: { ids: ['person-ben'], saving: true, onChange: vi.fn() } });
    expect(screen.getByRole('button', { name: 'memory_series_leave_out_add' })).toBeDisabled();
    expect(within(screen.getByTestId('series-person')).getByRole('button')).toBeDisabled();
  });
});
