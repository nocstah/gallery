import { themeManager, ThemePreference } from '@immich/ui';
import { render } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import AuthPageLayout from './AuthPageLayout.svelte';

// Local Omarchy layer: the sign-in card stands on the theme's bare ground (DESIGN.md, Ink: the sign-in page), where
// upstream blurred the mark into a cloud behind it
describe('AuthPageLayout', () => {
  beforeEach(() => {
    themeManager.setPreference(ThemePreference.Light);
  });

  const backdrop = (container: HTMLElement) => container.querySelector('img[src="/gallery-logo-mark.svg"]');

  it('stands the card on the bare ground, with the mark on the card alone', () => {
    const { container } = render(AuthPageLayout, { props: { title: 'Sign in' } });

    expect(backdrop(container)).toBeNull();
    expect(container.querySelector('[class*="backdrop-blur"]')).toBeNull();
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(container.querySelector('h1')?.textContent).toBe('Sign in');
  });

  it('still lays the cloud behind the card for a page that asks for it', () => {
    const { container } = render(AuthPageLayout, { props: { title: 'Sign in', withBackdrop: true } });

    expect(backdrop(container)).not.toBeNull();
  });
});
