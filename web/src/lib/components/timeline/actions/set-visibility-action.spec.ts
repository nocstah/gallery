import { modalManager } from '@immich/ui';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SetVisibilityAction from '$lib/components/timeline/actions/SetVisibilityAction.svelte';

// Local Omarchy layer: the Locked Folder's dialogs are titled by the button that opens them, so the way in and the
// way out each read one way (the test harness's svelte-i18n resolves keys to themselves: src/test-data/setup.ts)
describe('SetVisibilityAction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(modalManager, 'showDialog').mockResolvedValue(false);
  });

  it('asks to move photos into the Locked Folder in the words of its button', async () => {
    render(SetVisibilityAction, { onVisibilitySet: vi.fn() });

    await userEvent.click(screen.getByRole('button', { name: 'move_to_locked_folder' }));

    expect(modalManager.showDialog).toHaveBeenCalledWith(expect.objectContaining({ title: 'move_to_locked_folder' }));
  });

  it('asks to move them out in the words of its button, not "remove"', async () => {
    render(SetVisibilityAction, { onVisibilitySet: vi.fn(), unlock: true });

    await userEvent.click(screen.getByRole('button', { name: 'move_off_locked_folder' }));

    expect(modalManager.showDialog).toHaveBeenCalledWith(expect.objectContaining({ title: 'move_off_locked_folder' }));
  });
});
