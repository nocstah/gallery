import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import BarViewMenu from './BarViewMenu.svelte';

// Local Omarchy layer: the View menu holds the one light/dark control (Follow Omarchy, Light, Dark) and the way to the
// themes (Settings › Theme), the owner's "one light/dark control instead of three". The test harness's svelte-i18n
// resolves keys to themselves (src/test-data/setup.ts).
describe('BarViewMenu', () => {
  it('offers Follow Omarchy, Light and Dark as one choice, then the way to every theme', async () => {
    render(BarViewMenu);
    await userEvent.click(screen.getByRole('button', { name: 'display_options' }));

    const theme = screen.getByRole('radiogroup', { name: 'theme' });
    expect([...theme.querySelectorAll('[role=radio]')].map((radio) => radio.textContent?.trim())).toEqual([
      'theme_follow_omarchy',
      'light',
      'dark',
    ]);
    expect(screen.getByRole('link', { name: 'view_menu_all_themes' })).toHaveAttribute(
      'href',
      '/user-settings?isOpen=theme',
    );
  });
});
