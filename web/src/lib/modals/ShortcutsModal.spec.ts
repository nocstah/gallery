import { render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ShortcutsModal from './ShortcutsModal.svelte';

const { auth } = vi.hoisted(() => ({
  auth: {
    authenticated: false,
    user: { isAdmin: false },
    preferences: { ratings: { enabled: false } },
  },
}));

vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: auth }));

beforeEach(() => {
  auth.authenticated = false;
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

  // Local Omarchy layer: Shift+S saves a video's frame through Curator, which works for its owner (the admin) only
  it("lists Save frame as photo for Curator's owner", () => {
    auth.authenticated = true;
    auth.user.isAdmin = true;
    render(ShortcutsModal, { props: { onClose: vi.fn() } });

    expect(screen.getByText('save_frame_as_photo')).toBeInTheDocument();
  });

  it("leaves Save frame as photo out for a family member's account", () => {
    auth.authenticated = true;
    render(ShortcutsModal, { props: { onClose: vi.fn() } });

    expect(screen.getByText('stack_selected_photos')).toBeInTheDocument();
    expect(screen.queryByText('save_frame_as_photo')).not.toBeInTheDocument();
  });
});
