import { themeManager, ThemePreference } from '@immich/ui';
import { render } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Logo from './Logo.svelte';

describe('Logo Component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    themeManager.setPreference(ThemePreference.Light);
  });

  it('should render logo with default props', () => {
    const { container } = render(Logo);
    const img = container.querySelector('img');
    expect(img).toBeDefined();
    expect(img?.alt).toBe('Gallery logo');
  });

  it('should render icon variant by default', () => {
    const { container } = render(Logo);
    const img = container.querySelector('img');
    expect(img?.className).toContain('aspect-square');
    expect(img?.className).toContain('h-12');
  });

  it('should render inline variant', () => {
    const { container } = render(Logo, { props: { variant: 'inline' } });
    const img = container.querySelector('img');
    expect(img?.src).toContain('inline');
  });

  it('should render stacked variant', () => {
    const { container } = render(Logo, { props: { variant: 'stacked' } });
    const img = container.querySelector('img');
    expect(img?.src).toContain('stacked');
  });

  it('should apply size classes', () => {
    const { container } = render(Logo, { props: { size: 'large' } });
    const img = container.querySelector('img');
    expect(img?.className).toContain('h-16');
  });

  it('should use light theme logo by default', () => {
    themeManager.setPreference(ThemePreference.Light);
    const { container } = render(Logo, { props: { variant: 'inline' } });
    const img = container.querySelector('img');
    expect(img?.src).toContain('light');
  });

  it('should use dark theme logo when theme is dark', () => {
    themeManager.setPreference(ThemePreference.Dark);
    const { container } = render(Logo, { props: { variant: 'inline' } });
    const img = container.querySelector('img');
    expect(img?.src).toContain('dark');
  });

  it('should support custom classes', () => {
    const { container } = render(Logo, { props: { class: 'custom-class' } });
    const img = container.querySelector('img');
    expect(img?.className).toContain('custom-class');
  });

  // Local Omarchy layer: the bar's mark in two layers, its ink a mask over the text's colour and its colour on top
  describe('ink', () => {
    const parts = (container: HTMLElement) => ({
      box: container.querySelector('.ws-logo-ink'),
      mask: container.querySelector<HTMLElement>('.ws-logo-ink-mask')?.style.getPropertyValue('--ws-logo-src'),
      colour: container.querySelector('.ws-logo-ink-colour')?.getAttribute('src'),
      size: container.querySelector('.ws-logo-ink-size')?.getAttribute('src'),
    });

    it('draws the mark from its ink and colour layers, in one box hidden from screen readers', () => {
      const { container } = render(Logo, { props: { ink: true, size: 'tiny' } });
      const { box, mask, colour, size } = parts(container);
      expect(box?.getAttribute('aria-hidden')).toBe('true');
      expect(box?.className).toContain('h-8');
      expect(mask).toBe('url(/gallery-logo-mark-ink.svg)');
      expect(colour).toBe('/gallery-logo-mark-colour.svg');
      expect(size).toBe('/gallery-logo-mark-ink.svg');
      for (const img of container.querySelectorAll('img')) {
        expect(img.getAttribute('alt')).toBe('');
      }
    });

    it('draws the wordmark from its own layers', () => {
      const { container } = render(Logo, { props: { ink: true, variant: 'inline' } });
      const { mask, colour } = parts(container);
      expect(mask).toBe('url(/gallery-logo-inline-ink.svg)');
      expect(colour).toBe('/gallery-logo-inline-colour.svg');
    });

    it('takes the same layers on a dark theme, the ink from the text around it', () => {
      themeManager.setPreference(ThemePreference.Dark);
      const { container } = render(Logo, { props: { ink: true } });
      const { mask, colour } = parts(container);
      expect(mask).toBe('url(/gallery-logo-mark-ink.svg)');
      expect(colour).toBe('/gallery-logo-mark-colour.svg');
    });

    it('masks the stacked logo whole, with no colour layer', () => {
      const { container } = render(Logo, { props: { ink: true, variant: 'stacked' } });
      const { mask, colour } = parts(container);
      expect(mask).toBe('url(/gallery-logo-stacked.svg)');
      expect(colour).toBeUndefined();
    });
  });
});
