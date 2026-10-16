import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import FilterPanelSheetWrapper from '../filter-panel-sheet.test-wrapper.svelte';

// Local Omarchy layer: below 768px a page's filters open as a sheet over its photos (filter-panel.svelte, `sheet`).
// Before, the bar's filter button hid itself and opened a rail the theme hook's Custom CSS kept hidden on a phone,
// which left the person with no filters and no way back.

// svelte/reactivity's MediaQuery reads matchMedia when the module loads, so the manager is mocked with a switch.
// Reduced motion keeps the sheet's slide out of the way of the assertions.
const { media } = vi.hoisted(() => ({ media: { maxMd: true } }));
vi.mock('$lib/stores/media-query-manager.svelte', () => ({
  mediaQueryManager: {
    get maxMd() {
      return media.maxMd;
    },
    get reducedMotion() {
      return true;
    },
    get pointerCoarse() {
      return true;
    },
    get isFullSidebar() {
      return false;
    },
    get minLg() {
      return false;
    },
  },
}));

const COLLAPSED_KEY = 'gallery-filter-collapsed';

beforeAll(async () => {
  register('en-US', () => import('$i18n/en.json'));
  await init({ fallbackLocale: 'en-US' });
  await waitLocale('en-US');
});

const openSheet = async () => {
  await fireEvent.click(screen.getByTestId('filter-toggle-btn'));
  return screen.findByRole('dialog', { name: 'Filters' });
};

describe('the filter panel on a phone', () => {
  beforeEach(() => {
    localStorage.clear();
    media.maxMd = true;
  });

  it('starts on the photos, even where the rail was left open', () => {
    render(FilterPanelSheetWrapper, { initialCollapsed: false });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('sheet-collapsed')).toHaveTextContent('true');
    expect(screen.getByTestId('filter-toggle-btn')).toBeInTheDocument();
  });

  it('opens as a sheet over the photos, moved to the body, not as a rail beside them', async () => {
    render(FilterPanelSheetWrapper);

    const sheet = await openSheet();

    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(sheet).toContainElement(screen.getByTestId('discovery-panel'));
    expect(screen.getByTestId('filter-panel-sheet').parentElement).toBe(document.body);
    // the rail's shell is what the theme hook's narrow-screen rule hides; the sheet never carries it
    expect(screen.queryByTestId('filter-panel-shell')).toBeNull();
  });

  it('closes from its close button and gives the focus back to the filter button', async () => {
    render(FilterPanelSheetWrapper);
    await openSheet();

    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByTestId('sheet-collapsed')).toHaveTextContent('true');
    expect(screen.getByTestId('filter-toggle-btn')).toHaveFocus();
  });

  it('closes on Escape', async () => {
    render(FilterPanelSheetWrapper);
    const sheet = await openSheet();

    await fireEvent.keyDown(sheet, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByTestId('filter-toggle-btn')).toHaveFocus();
  });

  it('closes from the scrim over the photos', async () => {
    render(FilterPanelSheetWrapper);
    await openSheet();

    await fireEvent.click(screen.getByTestId('filter-sheet-scrim'));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes when the person presses anywhere outside it, such as the bar', async () => {
    render(FilterPanelSheetWrapper);
    await openSheet();

    await fireEvent.mouseDown(document.body);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('stays open while the person works inside it', async () => {
    render(FilterPanelSheetWrapper);
    const sheet = await openSheet();

    await fireEvent.mouseDown(screen.getByTestId('discovery-panel'));
    await fireEvent.click(screen.getByTestId('section-menu-btn'));

    expect(sheet).toBeInTheDocument();
    expect(screen.getByTestId('section-menu')).toBeInTheDocument();
  });

  it('never remembers the sheet as open', async () => {
    render(FilterPanelSheetWrapper);
    await openSheet();

    expect(localStorage.getItem(COLLAPSED_KEY)).not.toBe('false');
  });

  it('keeps the rail beside the photos on a wider screen', () => {
    media.maxMd = false;
    render(FilterPanelSheetWrapper, { initialCollapsed: false });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('filter-panel-shell')).toContainElement(screen.getByTestId('discovery-panel'));
  });

  it('leaves a panel the page places itself (the map drawer, the album picker) as it was', () => {
    render(FilterPanelSheetWrapper, { initialCollapsed: false, externalToggle: false });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('filter-panel-shell')).toContainElement(screen.getByTestId('discovery-panel'));
  });
});
