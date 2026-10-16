import type { ActionItem } from '@immich/ui';
import { render, screen } from '@testing-library/svelte';
import ActionMenuItem from './ActionMenuItem.svelte';

// Local Omarchy layer: a menu row can show its action's key at its end, as the photos' right-click menu does for B, V, Q

const action = (shortcuts?: ActionItem['shortcuts']): ActionItem => ({
  title: 'add_to_album_or_space',
  icon: 'M0 0h24v24H0z',
  onAction: vi.fn(),
  shortcuts,
});

describe('ActionMenuItem', () => {
  it('shows the action’s key with hint, for the eye only (the row keeps the action’s name)', () => {
    render(ActionMenuItem, { action: action([{ key: 'l' }]), hint: true });

    expect(screen.getByText('L')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('menuitem')).toHaveAccessibleName('add_to_album_or_space');
  });

  it('shows a modified key the way the menus write it', () => {
    render(ActionMenuItem, { action: action({ key: 'l', shift: true }), hint: true });

    expect(screen.getByText('⇧L')).toBeInTheDocument();
  });

  it('shows no key without hint, or when the action has none', () => {
    const { unmount } = render(ActionMenuItem, { action: action([{ key: 'l' }]) });
    expect(screen.queryByText('L')).toBeNull();
    unmount();

    render(ActionMenuItem, { action: action(), hint: true });
    expect(screen.getByRole('menuitem').textContent?.trim()).toBe('add_to_album_or_space');
  });
});
