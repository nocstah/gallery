import { keyboardManager } from '$lib/stores/keyboard-manager.svelte';

describe('keyboardManager', () => {
  afterEach(() => {
    dispatchEvent(new Event('blur'));
  });

  it('follows Shift from its key presses', () => {
    dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true }));
    expect(keyboardManager.shift).toBe(true);

    dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', shiftKey: false }));
    expect(keyboardManager.shift).toBe(false);
  });

  // Local Omarchy layer: a desktop shortcut can swallow Shift's keyup, after which every video under the pointer
  // played with sound until the next key press
  it('lets go of a Shift whose keyup never came at the next pointer event', () => {
    dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true }));
    expect(keyboardManager.shift).toBe(true);

    dispatchEvent(new MouseEvent('mouseover', { shiftKey: false }));
    expect(keyboardManager.shift).toBe(false);
  });

  it('reads a Shift held while moving onto a tile from the pointer event itself', () => {
    dispatchEvent(new MouseEvent('pointermove', { shiftKey: true }));
    expect(keyboardManager.shift).toBe(true);

    dispatchEvent(new MouseEvent('pointermove', { shiftKey: false }));
    expect(keyboardManager.shift).toBe(false);
  });

  it('lets go of everything when the window loses focus', () => {
    dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true, ctrlKey: true }));
    dispatchEvent(new Event('blur'));

    expect(keyboardManager.shift).toBe(false);
    expect(keyboardManager.ctrl).toBe(false);
  });
});
