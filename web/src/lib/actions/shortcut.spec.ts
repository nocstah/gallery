import { afterEach, describe, expect, it, vi } from 'vitest';
import { shortcuts, shouldIgnoreEvent } from './shortcut';

// Local Omarchy layer: a key typed into a field is the field's, a search field's too (@immich/ui's check let a search
// field's keys through to the page: "b" sent the photo under the pointer to To do, Ctrl+A selected every photo)
describe('shortcuts', () => {
  const press = (target: EventTarget, key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  };
  const field = (type: string) => {
    const input = document.createElement('input');
    input.type = type;
    document.body.append(input);
    return input;
  };

  afterEach(() => document.body.replaceChildren());

  it('runs a page key pressed anywhere else, and takes the key', () => {
    const onShortcut = vi.fn();
    const action = shortcuts(document.body, [{ shortcut: { key: 'b' }, onShortcut }]);
    const target = document.createElement('div');
    document.body.append(target);
    const event = press(target, 'b');
    expect(onShortcut).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
    action.destroy?.();
  });

  it.each(['search', 'text', 'url', 'number'])('leaves a key typed into a %s field to the field', (type) => {
    const onShortcut = vi.fn();
    const action = shortcuts(document.body, [
      { shortcut: { key: 'b' }, onShortcut },
      { shortcut: { key: 'a', ctrl: true }, onShortcut },
    ]);
    const input = field(type);
    expect(press(input, 'b').defaultPrevented).toBe(false);
    expect(press(input, 'a', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(onShortcut).not.toHaveBeenCalled();
    action.destroy?.();
  });

  it('leaves a key typed into anything editable to it', () => {
    const onShortcut = vi.fn();
    const action = shortcuts(document.body, [{ shortcut: { key: 'b' }, onShortcut }]);
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    document.body.append(editable);
    // happy-dom does not work out isContentEditable from the attribute
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    press(editable, 'b');
    expect(onShortcut).not.toHaveBeenCalled();
    action.destroy?.();
  });

  it('still runs a key meant for fields too (ignoreInputFields: false)', () => {
    const onShortcut = vi.fn();
    const action = shortcuts(document.body, [{ shortcut: { key: 'Escape' }, onShortcut, ignoreInputFields: false }]);
    press(field('search'), 'Escape');
    expect(onShortcut).toHaveBeenCalledOnce();
    action.destroy?.();
  });

  it('stops listening once destroyed', () => {
    const onShortcut = vi.fn();
    const action = shortcuts(document.body, [{ shortcut: { key: 'b' }, onShortcut }]);
    action.destroy?.();
    press(document.body, 'b');
    expect(onShortcut).not.toHaveBeenCalled();
  });
});

describe('shouldIgnoreEvent', () => {
  it('treats a paste into a search field as the field’s', () => {
    const input = document.createElement('input');
    input.type = 'search';
    document.body.append(input);
    const event = new Event('paste', { bubbles: true }) as ClipboardEvent;
    let ignored: boolean | undefined;
    document.addEventListener('paste', (pasted) => (ignored = shouldIgnoreEvent(pasted as ClipboardEvent)), {
      once: true,
    });
    input.dispatchEvent(event);
    expect(ignored).toBe(true);
    input.remove();
  });
});
