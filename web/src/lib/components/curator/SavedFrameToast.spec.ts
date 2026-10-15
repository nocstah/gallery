import { toastManager } from '@immich/ui';
import '@testing-library/jest-dom';
import { fireEvent, screen } from '@testing-library/svelte';
import SavedFrameToast from './SavedFrameToast.svelte';

// Local Omarchy layer: the saved-frame toast in @immich/ui's own toast panel, with the hook routes/+layout gives the
// panel: each toast sits right under .ws-toasts, which is where styles/omarchy-world.css gives every toast the window's
// corner. View and Undo close the toast and do their part.

describe('SavedFrameToast', () => {
  afterAll(async () => {
    await toastManager.unmount();
  });

  it("sits right under the panel's ws-toasts hook, and View and Undo close it as they act", async () => {
    toastManager.setOptions({ class: 'top-16 fixed ws-toasts' }); // as routes/+layout sets it
    const onView = vi.fn();
    const onUndo = vi.fn();
    const open = () =>
      toastManager.custom(
        { component: SavedFrameToast, props: { description: 'saved_as_photo', onView, onUndo, onClose: () => {} } },
        { timeout: 0 },
      );

    open();
    await vi.waitFor(() => expect(document.querySelector('.ws-toasts > div')).toHaveTextContent('saved_as_photo'));
    await fireEvent.click(screen.getByRole('button', { name: 'undo' }));
    expect(onUndo).toHaveBeenCalledOnce();

    // (a closed toast fades out, which never finishes here: the newest toast is the last)
    open();
    await vi.waitFor(() => expect(document.querySelectorAll('.ws-toasts > div')).toHaveLength(2));
    await fireEvent.click(screen.getAllByRole('button', { name: 'view' }).at(-1)!);
    expect(onView).toHaveBeenCalledOnce();
    expect(onUndo).toHaveBeenCalledOnce();
  });
});
