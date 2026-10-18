import { render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ShortcutsModal from './ShortcutsModal.svelte';

const { auth } = vi.hoisted(() => ({
  auth: {
    authenticated: false,
    isSharedLink: false,
    user: { isAdmin: false },
    preferences: { ratings: { enabled: false }, tags: { enabled: true } },
  },
}));

vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: auth }));

beforeEach(() => {
  auth.authenticated = false;
  auth.isSharedLink = false;
  auth.user.isAdmin = false;
});

// Drain bits-ui Modal's deferred body-scroll-lock cleanup before happy-dom tears
// down `document`. Otherwise CI can report an unhandled `document is not defined`
// after all assertions in this file have passed.
afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));
});

describe('ShortcutsModal', () => {
  it('uses the Gallery logo in the modal header', () => {
    render(ShortcutsModal, { props: { onClose: vi.fn() } });

    expect(screen.getByRole('img', { name: 'Gallery logo' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Immich logo' })).not.toBeInTheDocument();
  });

  // Local Omarchy layer: Shift+S saves a video's frame through Curator, which works for its owner (the admin) only;
  // in the sheet it sits with the viewer's keys, stacking with the selection's, so the two never read as one key
  it("lists Save frame as photo for Curator's owner, under the viewer", () => {
    auth.authenticated = true;
    auth.user.isAdmin = true;
    render(ShortcutsModal, { props: { onClose: vi.fn() } });

    expect(within(screen.getByTestId('shortcuts-viewer')).getByText('save_frame_as_photo')).toBeInTheDocument();
    expect(within(screen.getByTestId('shortcuts-selection')).getByText('stack_selected_photos')).toBeInTheDocument();
  });

  it("leaves Save frame as photo out for a family member's account", () => {
    auth.authenticated = true;
    render(ShortcutsModal, { props: { onClose: vi.fn() } });

    expect(screen.getByText('stack_selected_photos')).toBeInTheDocument();
    expect(screen.queryByText('save_frame_as_photo')).not.toBeInTheDocument();
  });

  it('groups the keys by where they work, each section headed', () => {
    auth.authenticated = true;
    render(ShortcutsModal, { props: { onClose: vi.fn() } });

    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent?.trim());
    expect(headings).toEqual([
      'shortcut_section_everywhere',
      'shortcut_section_grid',
      'shortcut_section_selection',
      'shortcut_section_viewer',
      'shortcut_section_album',
      'show_selected',
      'shortcut_section_film',
      'cmdk_shortcut_scope_heading',
    ]);
  });

  it('reads Shift out as a word, not as its arrow', () => {
    auth.authenticated = true;
    render(ShortcutsModal, { props: { onClose: vi.fn() } });

    const row = within(screen.getByTestId('shortcuts-everywhere')).getByText('shortcut_undo').closest('div')!;
    expect(row.querySelectorAll('kbd')).toHaveLength(2);
    const inspector = screen.getByText('inspector_window_shortcut').closest('div')!;
    expect(inspector.querySelector('kbd')?.textContent).toBe('⇧shortcut_key_shift');
    expect(inspector.querySelector('[aria-hidden="true"]')?.textContent).toBe('⇧');
  });

  it("shows a page's own keys instead of the whole sheet", () => {
    render(ShortcutsModal, {
      props: {
        onClose: vi.fn(),
        sections: [{ id: 'duplicates', title: 'Duplicates', rows: [{ keys: [['A']], action: 'Keep all' }] }],
      },
    });

    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['Duplicates']);
    expect(screen.getByText('Keep all')).toBeInTheDocument();
  });
});
