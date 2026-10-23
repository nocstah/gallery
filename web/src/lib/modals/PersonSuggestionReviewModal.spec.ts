import type { PersonFaceSuggestionPageResponseDto, PersonResponseDto } from '@immich/sdk';
import { toastManager } from '@immich/ui';
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beforeNavigate } from '$app/navigation';
import PersonSuggestionReviewModal from '$lib/modals/PersonSuggestionReviewModal.svelte';
import { handleError } from '$lib/utils/handle-error';

vi.mock('svelte-i18n', () => ({
  t: { subscribe: (run: (f: (k: string) => string) => void) => (run((k) => k), () => {}) },
}));

vi.mock('$app/navigation', () => ({ beforeNavigate: vi.fn() }));

vi.mock('$lib/utils/handle-error', () => ({ handleError: vi.fn() }));

vi.mock('@immich/ui', async (importOriginal: () => Promise<typeof import('@immich/ui')>) => {
  const actual = await importOriginal();
  return {
    ...actual,
    toastManager: {
      primary: vi.fn(),
      danger: vi.fn(),
    },
  };
});

// F24: the server states explicitly whether an action endpoint acted or was a no-op — see
// person.controller.ts / shared-space.controller.ts. S11b moved that signal out of the status code and into
// the response BODY (`{ acted }`, always under 200), because @oazapfts/runtime's ok() resolves to the body
// and discards the status for every success code, so a 200-vs-204 contract cannot be read by the generated
// SDK at all. The modal's confirm/dismiss/ignore props resolve to `{ acted: boolean }` on success and
// REJECT for every 4xx/5xx (including what
// used to be misread as "already resolved": a 400 is now always a genuine failure — see access.ts
// requireAccess).
const acted = (): { acted: boolean } => ({ acted: true });
const noOp = (): { acted: boolean } => ({ acted: false });
const authFailure = () => Object.assign(new Error('Not found or no access'), { status: 400 });
const serverError = () => Object.assign(new Error('Internal Server Error'), { status: 500 });

const person = { id: 'p1', name: 'Alice', updatedAt: '2026-01-01T00:00:00.000Z' } as PersonResponseDto;

function item(id: string) {
  return {
    assetFaceId: id,
    assetId: `asset-${id}`,
    distance: 0.6,
    imageWidth: 100,
    imageHeight: 100,
    boundingBoxX1: 10,
    boundingBoxX2: 40,
    boundingBoxY1: 10,
    boundingBoxY2: 40,
  };
}
const page1: PersonFaceSuggestionPageResponseDto = { total: 2, items: [item('f1'), item('f2')] };

function setup(
  overrides: Partial<{
    loadPage: ReturnType<typeof vi.fn>;
    confirm: ReturnType<typeof vi.fn>;
    dismiss: ReturnType<typeof vi.fn>;
    ignore: ReturnType<typeof vi.fn>;
    onClose: ReturnType<typeof vi.fn>;
  }> = {},
) {
  const props = {
    person,
    referenceThumbnailUrl: '/api/people/p1/thumbnail',
    loadPage: overrides.loadPage ?? vi.fn().mockResolvedValue(page1),
    confirm: overrides.confirm ?? vi.fn().mockResolvedValue(acted()),
    dismiss: overrides.dismiss ?? vi.fn().mockResolvedValue(acted()),
    ignore: overrides.ignore ?? vi.fn().mockResolvedValue(acted()),
    onClose: overrides.onClose ?? vi.fn(),
  };
  render(PersonSuggestionReviewModal, { props });
  return props;
}

describe('PersonSuggestionReviewModal', () => {
  beforeEach(() => {
    vi.mocked(handleError).mockClear();
    vi.mocked(toastManager.primary).mockClear();
  });

  // bits-ui's body-scroll-lock schedules `resetBodyStyle` on a 24ms `window.setTimeout` when a modal unmounts
  // (`body-scroll-lock.svelte.js`, the same-tick destroy/create guard). That callback touches `document.body`,
  // so if it is still pending when vitest tears the environment down it throws an UNHANDLED
  // `ReferenceError: document is not defined` — which fails the whole job even with every test passing.
  //
  // Unmounting EXPLICITLY here is the load-bearing part. @testing-library/svelte registers its auto-cleanup
  // afterEach at import time, so it runs AFTER this hook — meaning a bare sleep here waits BEFORE the unmount
  // that schedules the timer, and drains nothing. It only ever passed by winning a race, and lost that race
  // once this file's scheduling shifted. cleanup() forces the unmount first, then we outwait the 24ms.
  afterEach(async () => {
    cleanup();
    await new Promise((r) => setTimeout(r, 50));
  });

  it('loads page 1 and shows the first candidate + reference + counter', async () => {
    setup();
    await waitFor(() =>
      expect(screen.getByTestId('suggestion-progress')).toHaveTextContent('face_suggestion_progress'),
    );
    expect(screen.getByTestId('suggestion-full-photo')).toBeInTheDocument();
    // Before the full photo has loaded (happy-dom never fires `onload` on its own — nothing here dispatches
    // it), only the placeholder renders. The REAL overlay (`suggestion-highlight`) and its computed geometry
    // are covered by the dedicated test below, once `load` is dispatched explicitly.
    expect(screen.getByTestId('suggestion-highlight-placeholder')).toBeInTheDocument();
    expect(screen.queryByTestId('suggestion-highlight')).not.toBeInTheDocument();
    // reference image uses getPeopleThumbnailUrl output, NOT an asset media url
    const ref = screen.getByTestId('suggestion-reference') as HTMLImageElement;
    expect(ref.getAttribute('src')).toContain('/api/people/p1/thumbnail');
  });

  it('renders the real highlight overlay (not the placeholder) with geometry computed from the loaded photo', async () => {
    setup();
    await waitFor(() => screen.getByTestId('suggestion-full-photo'));
    const img = screen.getByTestId('suggestion-full-photo') as HTMLImageElement;

    // A 1000x500 natural image rendered into a 400x300 box: scaleToFit picks the narrower-fitting axis
    // (400/1000 = 0.4 vs 300/500 = 0.6, so 0.4 wins), so the photo is horizontally full-bleed (400 wide) and
    // letterboxed top/bottom (200 tall, centered with a 50px offset on each side). happy-dom has no layout
    // engine, so both the "client" size and the "natural" size have to be stubbed explicitly — width/height
    // reflect content attributes (settable directly); naturalWidth/naturalHeight have no public setter.
    img.width = 400;
    img.height = 300;
    Object.defineProperties(img, {
      naturalWidth: { value: 1000, configurable: true },
      naturalHeight: { value: 500, configurable: true },
    });

    await fireEvent.load(img);

    await waitFor(() => expect(screen.getByTestId('suggestion-highlight')).toBeInTheDocument());
    expect(screen.queryByTestId('suggestion-highlight-placeholder')).not.toBeInTheDocument();

    // f1's box is (10,10)-(40,40) in a 100x100 metadata space, i.e. normalized 0.1..0.4 on both axes.
    // Expected pixel geometry, worked out independently of the component's own arithmetic:
    //   contentWidth = 1000 * 0.4 = 400, contentHeight = 500 * 0.4 = 200
    //   offsetX = (400 - 400) / 2 = 0,    offsetY = (300 - 200) / 2 = 50
    //   left = 0.1 * 400 + 0 = 40,   top    = 0.1 * 200 + 50 = 70
    //   width = 0.4 * 400 - 40 = 120, height = 0.4 * 200 + 50 - 70 = 60
    const overlay = screen.getByTestId('suggestion-highlight');
    expect(overlay.style.left).toBe('40px');
    expect(overlay.style.top).toBe('70px');
    expect(overlay.style.width).toBe('120px');
    expect(overlay.style.height).toBe('60px');
  });

  it('keeps choices editable through the last face, then saves and closes explicitly', async () => {
    const { confirm, onClose } = setup();
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));
    await userEvent.click(screen.getByTestId('suggestion-same-btn'));
    await userEvent.click(screen.getByTestId('suggestion-same-btn'));
    expect(screen.getByTestId('suggestion-all-done')).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId('suggestion-prev-btn'));
    expect(screen.getByTestId('suggestion-same-btn')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('suggestion-same-btn')).toBeEnabled();
    await userEvent.click(screen.getByTestId('suggestion-save-btn'));
    expect(confirm.mock.calls).toEqual([['f1'], ['f2']]);
    expect(onClose).toHaveBeenCalledExactlyOnceWith({ confirmed: 2 });
    expect(toastManager.primary).toHaveBeenCalledOnce();
  });

  const buttons = ['same', 'different', 'ignore'] as const;
  const methods = { same: 'confirm', different: 'dismiss', ignore: 'ignore' } as const;
  it.each(buttons.flatMap((from) => buttons.filter((to) => to !== from).map((to) => ({ from, to }))))(
    'going back replaces $from with $to; only the final choice reaches the server',
    async ({ from, to }) => {
      const props = setup();
      await waitFor(() => screen.getByTestId('suggestion-same-btn'));
      await userEvent.click(screen.getByTestId(`suggestion-${from}-btn`));
      await userEvent.click(screen.getByTestId('suggestion-prev-btn'));
      expect(screen.getByTestId(`suggestion-${from}-btn`)).toHaveAttribute('aria-pressed', 'true');
      await userEvent.click(screen.getByTestId(`suggestion-${to}-btn`));
      await userEvent.click(screen.getByTestId('suggestion-prev-btn'));
      expect(screen.getByTestId(`suggestion-${to}-btn`)).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId(`suggestion-${from}-btn`)).toHaveAttribute('aria-pressed', 'false');
      for (const method of Object.values(methods)) {
        expect(props[method]).not.toHaveBeenCalled();
      }
      await userEvent.click(screen.getByTestId('suggestion-save-btn'));
      for (const [button, method] of Object.entries(methods)) {
        expect(props[method].mock.calls).toEqual(button === to ? [['f1']] : []);
      }
      expect(props.onClose).toHaveBeenCalledWith({ confirmed: to === 'same' ? 1 : 0 });
    },
  );

  it('reselecting the same choice does not submit it twice', async () => {
    const { confirm } = setup();
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));
    await userEvent.click(screen.getByTestId('suggestion-same-btn'));
    await userEvent.click(screen.getByTestId('suggestion-prev-btn'));
    await userEvent.click(screen.getByTestId('suggestion-same-btn'));
    await userEvent.click(screen.getByTestId('suggestion-save-btn'));
    expect(confirm).toHaveBeenCalledExactlyOnceWith('f1');
  });

  it('navigation leaves skipped faces pending and closes without writes if nothing was chosen', async () => {
    const props = setup();
    await waitFor(() => screen.getByTestId('suggestion-progress'));
    expect(screen.getByTestId('suggestion-prev-btn')).toBeDisabled();
    await userEvent.click(screen.getByTestId('suggestion-next-btn'));
    expect(screen.getByTestId('suggestion-progress')).toHaveAttribute('data-current', '2');
    await fireEvent.keyDown(document.body, { key: '[' });
    expect(screen.getByTestId('suggestion-progress')).toHaveAttribute('data-current', '1');
    await fireEvent.keyDown(document.body, { key: ']' });
    await userEvent.click(screen.getByTestId('suggestion-save-btn'));
    expect(props.onClose).toHaveBeenCalledWith({ confirmed: 0 });
    expect(props.confirm).not.toHaveBeenCalled();
    expect(props.dismiss).not.toHaveBeenCalled();
    expect(props.ignore).not.toHaveBeenCalled();
  });

  it.each(buttons)('Enter chooses Same person even with %s focused', async (button) => {
    const { confirm, dismiss, ignore } = setup();
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));
    screen.getByTestId(`suggestion-${button}-btn`).focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('suggestion-progress')).toHaveAttribute('data-current', '2');
    await userEvent.click(screen.getByTestId('suggestion-save-btn'));
    expect(confirm).toHaveBeenCalledExactlyOnceWith('f1');
    expect(dismiss).not.toHaveBeenCalled();
    expect(ignore).not.toHaveBeenCalled();
  });

  it('Enter on the explicitly focused save button saves without choosing the current face', async () => {
    const { confirm } = setup();
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));
    await userEvent.keyboard('{Enter}');
    screen.getByTestId('suggestion-save-btn').focus();
    await userEvent.keyboard('{Enter}');
    expect(confirm).toHaveBeenCalledExactlyOnceWith('f1');
  });

  it('ignores held Enter, modified Enter and Enter while the next page is loading', async () => {
    let finishTopUp!: (page: PersonFaceSuggestionPageResponseDto) => void;
    const topUp = new Promise<PersonFaceSuggestionPageResponseDto>((resolve) => {
      finishTopUp = resolve;
    });
    const loadPage = vi
      .fn()
      .mockResolvedValueOnce({ total: 52, items: Array.from({ length: 50 }, (_, i) => item(`f${i + 1}`)) })
      .mockReturnValueOnce(topUp);
    const { confirm } = setup({ loadPage });
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));
    await fireEvent.keyDown(document.body, { key: 'Enter', ctrlKey: true });
    await fireEvent.keyDown(document.body, { key: 'Enter', repeat: true });
    expect(screen.getByTestId('suggestion-progress')).toHaveAttribute('data-current', '1');
    for (let i = 0; i < 47; i++) {
      await fireEvent.keyDown(document.body, { key: 'Enter' });
    }
    expect(screen.getByTestId('suggestion-progress')).toHaveAttribute('data-current', '48');
    expect(screen.getByTestId('suggestion-same-btn')).toBeDisabled();
    await fireEvent.keyDown(document.body, { key: 'Enter' });
    finishTopUp({ total: 52, items: [item('f51'), item('f52')] });
    await waitFor(() => expect(screen.getByTestId('suggestion-same-btn')).toBeEnabled());
    await fireEvent.keyDown(document.body, { key: 'Enter', repeat: true });
    expect(screen.getByTestId('suggestion-progress')).toHaveAttribute('data-current', '48');
    await userEvent.click(screen.getByTestId('suggestion-save-btn'));
    expect(confirm).toHaveBeenCalledTimes(47);
  });

  it('arrow keys only navigate and never choose any verdict', async () => {
    const props = setup({
      loadPage: vi.fn().mockResolvedValue({ total: 3, items: [item('f1'), item('f2'), item('f3')] }),
    });
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByTestId('suggestion-progress')).toHaveAttribute('data-current', '2');
    await userEvent.keyboard('{ArrowDown}{ArrowUp}');
    expect(screen.getByTestId('suggestion-progress')).toHaveAttribute('data-current', '2');
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByTestId('suggestion-progress')).toHaveAttribute('data-current', '1');
    expect(screen.queryByTestId('suggestion-reviewed-badge')).not.toBeInTheDocument();
    expect(screen.getByTestId('suggestion-same-btn')).toHaveAttribute('aria-keyshortcuts', 'Enter');
    await userEvent.click(screen.getByTestId('suggestion-save-btn'));
    expect(props.confirm).not.toHaveBeenCalled();
    expect(props.dismiss).not.toHaveBeenCalled();
    expect(props.ignore).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalledWith({ confirmed: 0 });
  });

  it('ArrowLeft returns to an Enter choice and lets the user replace it', async () => {
    const { confirm, dismiss } = setup();
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));
    await userEvent.keyboard('{Enter}{ArrowLeft}');
    expect(screen.getByTestId('suggestion-progress')).toHaveAttribute('data-current', '1');
    expect(screen.getByTestId('suggestion-same-btn')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('suggestion-different-btn')).toBeEnabled();
    await userEvent.click(screen.getByTestId('suggestion-different-btn'));
    await userEvent.keyboard('{ArrowLeft}{ArrowRight}');
    await userEvent.click(screen.getByTestId('suggestion-save-btn'));
    expect(confirm).not.toHaveBeenCalled();
    expect(dismiss).toHaveBeenCalledExactlyOnceWith('f1');
  });

  it('modified arrow keys do not navigate or change a choice', async () => {
    const { confirm, dismiss, ignore } = setup();
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
      await fireEvent.keyDown(document.body, { key: 'ArrowRight', [modifier]: true });
      expect(screen.getByTestId('suggestion-progress')).toHaveAttribute('data-current', '1');
    }
    await userEvent.click(screen.getByTestId('suggestion-save-btn'));
    expect(confirm).not.toHaveBeenCalled();
    expect(dismiss).not.toHaveBeenCalled();
    expect(ignore).not.toHaveBeenCalled();
  });

  it.each(buttons)('a 400 while saving %s leaves the choice available for correction and retry', async (button) => {
    const action = vi.fn().mockRejectedValueOnce(authFailure()).mockResolvedValue(acted());
    const props = setup({ [methods[button]]: action });
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));
    await userEvent.click(screen.getByTestId(`suggestion-${button}-btn`));
    await userEvent.click(screen.getByTestId('suggestion-save-btn'));
    expect(handleError).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).toHaveTextContent('face_suggestion_save_error');
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('suggestion-progress')).toHaveAttribute('data-current', '1');
    expect(screen.getByTestId(`suggestion-${button}-btn`)).toBeEnabled();
    expect(screen.getByTestId(`suggestion-${button}-btn`)).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByTestId('suggestion-save-btn'));
    expect(action).toHaveBeenCalledTimes(2);
    expect(props.onClose).toHaveBeenCalledWith({ confirmed: button === 'same' ? 1 : 0 });
  });

  it.each(buttons)('acted:false for %s completes without inflating confirmations', async (button) => {
    const props = setup({ [methods[button]]: vi.fn().mockResolvedValue(noOp()) });
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));
    await userEvent.click(screen.getByTestId(`suggestion-${button}-btn`));
    await userEvent.click(screen.getByTestId('suggestion-save-btn'));
    expect(props.onClose).toHaveBeenCalledWith({ confirmed: 0 });
    expect(handleError).not.toHaveBeenCalled();
    expect(toastManager.primary).not.toHaveBeenCalled();
  });

  it('retries a partial save without replaying saved faces and allows changing an unsaved face', async () => {
    const confirm = vi.fn().mockResolvedValueOnce(acted()).mockRejectedValueOnce(serverError());
    const { ignore, onClose } = setup({ confirm });
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));
    await userEvent.keyboard('{Enter}{Enter}');
    await userEvent.click(screen.getByTestId('suggestion-save-btn'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('suggestion-progress')).toHaveAttribute('data-current', '2');
    await userEvent.click(screen.getByTestId('suggestion-prev-btn'));
    expect(screen.getByTestId('suggestion-reviewed-badge')).toHaveTextContent('saved');
    expect(screen.getByTestId('suggestion-same-btn')).toBeDisabled();
    await userEvent.click(screen.getByTestId('suggestion-next-btn'));
    await userEvent.click(screen.getByTestId('suggestion-ignore-btn'));
    await userEvent.click(screen.getByTestId('suggestion-save-btn'));
    expect(confirm.mock.calls).toEqual([['f1'], ['f2']]);
    expect(ignore).toHaveBeenCalledExactlyOnceWith('f2');
    expect(onClose).toHaveBeenCalledExactlyOnceWith({ confirmed: 1 });
  });

  it('can leave after a failed save by discarding only the unsaved remainder', async () => {
    const confirm = vi.fn().mockResolvedValueOnce(acted()).mockRejectedValueOnce(serverError());
    const { onClose } = setup({ confirm });
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));
    await userEvent.keyboard('{Enter}{Enter}');
    await userEvent.click(screen.getByTestId('suggestion-save-btn'));
    await userEvent.click(screen.getByTestId('suggestion-discard-btn'));
    expect(onClose).toHaveBeenCalledWith({ confirmed: 1 });
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('disables duplicate saves, choices and closing until saving finishes', async () => {
    let finish!: (result: { acted: boolean }) => void;
    const confirm = vi.fn().mockReturnValue(
      new Promise<{ acted: boolean }>((resolve) => {
        finish = resolve;
      }),
    );
    const { onClose } = setup({ confirm });
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));
    await userEvent.keyboard('{Enter}');
    await userEvent.click(screen.getByTestId('suggestion-save-btn'));
    expect(screen.getByTestId('suggestion-save-btn')).toBeDisabled();
    expect(screen.getByTestId('suggestion-same-btn')).toBeDisabled();
    await userEvent.keyboard('{Enter}{Escape}');
    expect(confirm).toHaveBeenCalledExactlyOnceWith('f1');
    expect(onClose).not.toHaveBeenCalled();
    finish(acted());
    await waitFor(() => expect(onClose).toHaveBeenCalledExactlyOnceWith({ confirmed: 1 }));
  });

  it('Escape saves the chosen faces before closing', async () => {
    const { confirm, onClose } = setup();
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));
    await userEvent.keyboard('{Enter}{Escape}');
    await waitFor(() => expect(confirm).toHaveBeenCalledExactlyOnceWith('f1'));
    expect(onClose).toHaveBeenCalledExactlyOnceWith({ confirmed: 1 });
  });

  it('protects unsaved choices on browser reload and route navigation', async () => {
    setup();
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));
    const cancel = vi.fn();
    const callback = vi.mocked(beforeNavigate).mock.calls.at(-1)![0];
    callback({ type: 'leave', cancel, from: null, to: null, willUnload: true, complete: Promise.resolve() });
    expect(cancel).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    callback({ type: 'leave', cancel, from: null, to: null, willUnload: true, complete: Promise.resolve() });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each(['empty', 'error'])('closes cleanly when the initial page is %s', async (kind) => {
    const loadPage =
      kind === 'empty' ? vi.fn().mockResolvedValue({ total: 0, items: [] }) : vi.fn().mockRejectedValue(serverError());
    const { onClose } = setup({ loadPage });
    await waitFor(() => expect(onClose).toHaveBeenCalledExactlyOnceWith({ confirmed: 0 }));
    expect(handleError).toHaveBeenCalledTimes(kind === 'empty' ? 0 : 1);
  });

  it('reviews 120 faces without writes shifting pagination, then submits each final choice once', async () => {
    const faces = Array.from({ length: 120 }, (_, i) => item(`f${i}`));
    const loadPage = vi.fn(({ page, size }: { page: number; size: number }) =>
      Promise.resolve({
        total: faces.length,
        items: faces.slice((page - 1) * size, page * size),
      }),
    );
    const { confirm, onClose } = setup({ loadPage });
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));
    for (let i = 0; i < faces.length; i++) {
      await waitFor(() => expect(screen.getByTestId('suggestion-same-btn')).toBeEnabled());
      expect(screen.getByTestId('suggestion-progress')).toHaveAttribute('data-current', String(i + 1));
      expect(screen.getByTestId('suggestion-progress')).toHaveAttribute('data-total', '120');
      await fireEvent.keyDown(document.body, { key: 'Enter' });
    }
    expect(loadPage.mock.calls.map(([req]) => req.page)).toEqual([1, 2, 3]);
    expect(confirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId('suggestion-save-btn'));
    expect(confirm.mock.calls.map(([id]) => id)).toEqual(faces.map((face) => face.assetFaceId));
    expect(onClose).toHaveBeenCalledWith({ confirmed: 120 });
  });

  it('keeps the current face and retries a failed page without losing its choice', async () => {
    const faces = Array.from({ length: 50 }, (_, i) => item(`f${i}`));
    const loadPage = vi.fn().mockResolvedValueOnce({ total: 51, items: faces }).mockRejectedValue(serverError());
    const { confirm, onClose } = setup({ loadPage });
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));
    for (let i = 0; i < 50; i++) {
      await waitFor(() => expect(screen.getByTestId('suggestion-same-btn')).toBeEnabled());
      await fireEvent.keyDown(document.body, { key: 'Enter' });
    }
    expect(screen.getByTestId('suggestion-progress')).toHaveAttribute('data-current', '50');
    expect(onClose).not.toHaveBeenCalled();
    loadPage.mockResolvedValue({ total: 51, items: [item('last')] });
    await userEvent.click(screen.getByTestId('suggestion-next-btn'));
    expect(screen.getByTestId('suggestion-progress')).toHaveAttribute('data-current', '51');
    await userEvent.click(screen.getByTestId('suggestion-save-btn'));
    expect(confirm).toHaveBeenCalledTimes(50);
  });
  it('restarts pagination after a partial save so shifted offsets do not skip faces', async () => {
    const faces = Array.from({ length: 120 }, (_, i) => item(`f${i}`));
    let remaining = [...faces];
    let failOnce = true;
    const loadPage = vi.fn(({ page, size }: { page: number; size: number }) =>
      Promise.resolve({
        total: remaining.length,
        items: remaining.slice((page - 1) * size, page * size),
      }),
    );
    const confirm = vi.fn((id: string) => {
      if (id === 'f1' && failOnce) {
        failOnce = false;
        return Promise.reject(serverError());
      }
      remaining = remaining.filter((face) => face.assetFaceId !== id);
      return Promise.resolve(acted());
    });
    const { onClose } = setup({ loadPage, confirm });
    await waitFor(() => screen.getByTestId('suggestion-same-btn'));
    await userEvent.keyboard('{Enter}{Enter}');
    await userEvent.click(screen.getByTestId('suggestion-save-btn'));
    expect(remaining).toHaveLength(119);
    expect(onClose).not.toHaveBeenCalled();
    for (let i = 1; i < faces.length; i++) {
      await waitFor(() => expect(screen.getByTestId('suggestion-same-btn')).toBeEnabled());
      expect(screen.getByTestId('suggestion-progress')).toHaveAttribute('data-current', String(i + 1));
      await fireEvent.keyDown(document.body, { key: 'Enter' });
    }
    expect(loadPage.mock.calls.map(([req]) => req.page)).toEqual([1, 1, 2, 3]);
    await userEvent.click(screen.getByTestId('suggestion-save-btn'));
    expect(remaining).toHaveLength(0);
    expect(confirm.mock.calls.filter(([id]) => id === 'f0')).toHaveLength(1);
    expect(onClose).toHaveBeenCalledExactlyOnceWith({ confirmed: 120 });
  });
});
