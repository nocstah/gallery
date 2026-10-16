import { filmKeyAction } from './film-keys';

const key = (value: string, extra: Partial<KeyboardEvent> = {}) =>
  ({ key: value, ctrlKey: false, metaKey: false, altKey: false, target: document.body, ...extra }) as KeyboardEvent;

describe(filmKeyAction.name, () => {
  it.each([
    [' ', 'toggle'],
    ['ArrowLeft', 'previous'],
    ['ArrowRight', 'next'],
    ['m', 'mute'],
    ['M', 'mute'],
    ['n', 'next-song'],
    ['N', 'next-song'],
    ['Escape', 'close'],
  ])('%j does %s', (value, action) => {
    expect(filmKeyAction(key(value))).toBe(action);
  });

  it('leaves other keys alone', () => {
    expect(filmKeyAction(key('a'))).toBeUndefined();
    expect(filmKeyAction(key('ArrowUp'))).toBeUndefined();
    expect(filmKeyAction(key('Enter'))).toBeUndefined();
  });

  it("leaves a key held with Ctrl, Alt or Meta to someone else's shortcut", () => {
    expect(filmKeyAction(key('m', { ctrlKey: true }))).toBeUndefined();
    expect(filmKeyAction(key('ArrowRight', { altKey: true }))).toBeUndefined();
    expect(filmKeyAction(key(' ', { metaKey: true }))).toBeUndefined();
  });

  it('takes nothing from a field or an open menu', () => {
    const field = document.createElement('input');
    const menu = document.createElement('ul');
    menu.setAttribute('role', 'menu');
    const item = document.createElement('li');
    menu.append(item);
    document.body.append(field, menu);

    expect(filmKeyAction(key(' ', { target: field }))).toBeUndefined();
    expect(filmKeyAction(key('ArrowRight', { target: item }))).toBeUndefined();

    field.remove();
    menu.remove();
  });
});
