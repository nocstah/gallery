class KeyboardManager {
  #shift = $state(false);
  #ctrl = $state(false);
  #meta = $state(false);
  #alt = $state(false);

  constructor() {
    if (globalThis.window === undefined) {
      return;
    }
    addEventListener('keydown', this.#update);
    addEventListener('keyup', this.#update);
    addEventListener('blur', this.#clear);
    // Local Omarchy layer: a pointer event carries the real modifier state too. A key let go while a desktop shortcut
    // (Super+Shift+…) or another surface had the keyboard never reaches the page as a keyup, which left Shift "held"
    // until the next key press, so every video under the pointer played with sound; the next pointer event (moving
    // onto a tile is one) puts it right.
    for (const type of ['pointermove', 'pointerdown', 'mouseover'] as const) {
      addEventListener(type, this.#update, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', () => document.hidden && this.#clear());
  }

  get shift() {
    return this.#shift;
  }

  get ctrl() {
    return this.#ctrl;
  }

  get meta() {
    return this.#meta;
  }

  get alt() {
    return this.#alt;
  }

  #update = (event: KeyboardEvent | MouseEvent) => {
    this.#shift = event.shiftKey;
    this.#ctrl = event.ctrlKey;
    this.#meta = event.metaKey;
    this.#alt = event.altKey;
  };

  #clear = () => {
    this.#shift = false;
    this.#ctrl = false;
    this.#meta = false;
    this.#alt = false;
  };
}

export const keyboardManager = new KeyboardManager();
