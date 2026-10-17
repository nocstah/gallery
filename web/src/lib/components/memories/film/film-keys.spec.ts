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
    expect(filmKeyAction(key('GoBack'))).toBeUndefined();
    expect(filmKeyAction(key('a'), 'room')).toBeUndefined();
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
    expect(filmKeyAction(key('Enter', { target: field }), 'room')).toBeUndefined();

    field.remove();
    menu.remove();
  });

  describe('dressed for Room', () => {
    it.each([
      [' ', 'toggle'],
      ['Enter', 'toggle'],
      ['ArrowLeft', 'previous'],
      ['ArrowRight', 'next'],
      ['ArrowUp', 'previous-film'],
      ['ArrowDown', 'next-film'],
      ['m', 'mute'],
      ['N', 'next-song'],
      ['Escape', 'close'],
      ['GoBack', 'close'],
      ['BrowserBack', 'close'],
      ['XF86Back', 'close'],
      ['MediaPlayPause', 'toggle'],
      ['MediaTrackNext', 'next-film'],
      ['MediaTrackPrevious', 'previous-film'],
    ])('a remote or keyboard %j does %s', (value, action) => {
      expect(filmKeyAction(key(value), 'room')).toBe(action);
    });

    it('still leaves keys held with Ctrl, Alt or Meta alone', () => {
      expect(filmKeyAction(key('ArrowDown', { ctrlKey: true }), 'room')).toBeUndefined();
      expect(filmKeyAction(key('Enter', { altKey: true }), 'room')).toBeUndefined();
    });
  });
});
