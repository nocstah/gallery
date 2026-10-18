import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
import UserPageLayoutDescriptionTrailingTestWrapper from './user-page-layout-description-trailing.test-wrapper.svelte';
import UserPageLayoutFoldTestWrapper from './user-page-layout-fold.test-wrapper.svelte';

const layoutMocks = vi.hoisted(() => ({
  sidebarModeStore: { layout: 'expanded' as 'overlay' | 'rail' | 'expanded' },
}));

vi.mock('$lib/stores/sidebar-mode.svelte', () => ({ sidebarModeStore: layoutMocks.sidebarModeStore }));

vi.mock('$lib/components/shared-components/navigation-bar/NavigationBar.svelte', async () => {
  const module = await import('@test-data/mocks/navigation-bar-rail-aware.stub.svelte');
  return { default: module.default };
});

// Local Omarchy layer: UserPageLayout renders the one bar (OmarchyBar) where upstream rendered NavigationBar
vi.mock('$lib/components/omarchy/OmarchyBar.svelte', async () => {
  const module = await import('@test-data/mocks/omarchy-bar-rail-aware.stub.svelte');
  return { default: module.default };
});

vi.mock('$lib/components/shared-components/side-bar/UserSidebar.svelte', async () => {
  const module = await import('@test-data/mocks/noop-component.svelte');
  return { default: module.default };
});

describe('UserPageLayout header', () => {
  it('keeps long people statistics visible beside a truncating title', () => {
    render(UserPageLayout, {
      props: {
        title: 'People',
        description: '(60) \u{B7} 2,901 faces',
      },
    });

    expect(screen.getByTestId('page-header-description')).toHaveTextContent('(60) \u{B7} 2,901 faces');
    expect(screen.getByTestId('page-header-title-row')).toHaveClass('min-w-0', 'overflow-hidden');
    expect(screen.getByTestId('page-header')).toHaveClass('min-w-0', 'truncate');
    expect(screen.getByTestId('page-header-description')).toHaveClass('shrink-0', 'whitespace-nowrap');
  });

  // Local Omarchy layer: the bar's title is the page's one h1, so the main pages have a heading to land on
  it("makes the bar's title the page's h1", () => {
    render(UserPageLayout, { props: { title: 'Albums' } });

    expect(screen.getByRole('heading', { level: 1, name: 'Albums' })).toBe(screen.getByTestId('page-header'));
    expect(screen.getAllByRole('heading')).toHaveLength(1);
  });

  // Local Omarchy layer: a page that heads its body with a name of its own (a Space's album) keeps the bar's title,
  // the Space it is in, as text, so the album's name is the page's one h1
  it("keeps the bar's title as text where the page's heading is in its body", () => {
    render(UserPageLayout, { props: { title: 'Library', headingInBody: true } });

    expect(screen.getByTestId('page-header')).toHaveTextContent('Library');
    expect(screen.getByTestId('page-header').localName).toBe('div');
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('renders a non-collapsing description trailing action beside the description', () => {
    render(UserPageLayoutDescriptionTrailingTestWrapper);

    const titleRow = screen.getByTestId('page-header-title-row');
    const title = screen.getByTestId('page-header');
    const description = screen.getByTestId('page-header-description');
    const trailing = screen.getByTestId('page-header-description-trailing');
    const button = screen.getByRole('button', { name: 'Info' });

    expect(trailing).toContainElement(button);
    expect(titleRow).toHaveClass('min-w-0', 'overflow-hidden');
    expect(title).toHaveClass('min-w-0', 'truncate');
    expect(description).toHaveClass('whitespace-nowrap');
    expect(trailing).toHaveClass('shrink-0');
    expect(titleRow).toContainElement(description);
    expect(titleRow).toContainElement(trailing);
    expect(description.nextElementSibling).toBe(trailing);
  });
});

describe('UserPageLayout sidebar width', () => {
  it.each`
    layout        | width         | cssValue
    ${'overlay'}  | ${'0'}        | ${'0px'}
    ${'rail'}     | ${'rail'}     | ${'calc(var(--spacing) * 20)'}
    ${'expanded'} | ${'expanded'} | ${'calc(var(--spacing) * 64)'}
  `('sets the grid width to $width for $layout', ({ layout, width, cssValue }) => {
    layoutMocks.sidebarModeStore.layout = layout;

    render(UserPageLayout);

    const grid = screen.getByTestId('user-page-grid');
    expect(grid).toHaveAttribute('data-sidebar-width', width);
    // Guards the actual `--sidebar-width` custom property driving `grid-cols-[var(--sidebar-width)_auto]`,
    // not just the semantic label above - a rail/expanded value swap would otherwise pass unnoticed.
    expect(grid.style.getPropertyValue('--sidebar-width')).toBe(cssValue);
  });

  // Spec coverage 29: /tags and /folders pass their own tree-explorer sidebar wrapping
  // upstream Sidebar.svelte, which renders sidebar:w-64 regardless of our variable. Applying
  // the rail width there would put a 16rem sidebar in a 4rem column.
  it('keeps the expanded width when a custom sidebar snippet is supplied', () => {
    layoutMocks.sidebarModeStore.layout = 'rail';

    render(UserPageLayout, {
      props: { sidebar: createRawSnippet(() => ({ render: () => `<nav data-testid="tree">tree</nav>` })) },
    });

    expect(screen.getByTestId('user-page-grid')).toHaveAttribute('data-sidebar-width', 'expanded');
  });

  // Spec coverage 29 (navbar side). A custom sidebar snippet (/tags, /folders) keeps the
  // grid column at the expanded width above, but the navbar's own rail-aware sizing is
  // driven independently by the `railAware` prop - passing it unconditionally would still
  // shrink the navbar's logo/column and surface a hamburger that calls
  // `toggleRailOverlay()`, which those pages' upstream Sidebar.svelte has no wiring for.
  it('does not pass railAware to the navbar when a custom sidebar snippet is supplied', () => {
    render(UserPageLayout, {
      props: { sidebar: createRawSnippet(() => ({ render: () => `<nav data-testid="tree">tree</nav>` })) },
    });

    expect(screen.getByTestId('navigation-bar-stub')).toHaveAttribute('data-rail-aware', 'false');
  });

  it('passes railAware to the navbar by default', () => {
    render(UserPageLayout);

    expect(screen.getByTestId('navigation-bar-stub')).toHaveAttribute('data-rail-aware', 'true');
  });
});

// The chrome band above the content panel is what the user sees, and the panel contributes none
// of it: it dropped its top margin so the navbar could own that gutter and centre its search
// field in the band the two of them form. That makes the panel's top edge depend on whatever
// stands above it, and the two routes have to agree - with a navbar the gutter is folded into
// --navbar-height, without one it has to be added to the ControlAppBar reserve, which is spent
// raw by full-bleed <main> elements elsewhere and so cannot absorb it. happy-dom has no cascade
// or layout to measure, so the coupling is asserted against the stylesheet itself.
describe('UserPageLayout chrome above the content panel', () => {
  // Read from gallery-theme.css rather than restated here: the point is that the layout's
  // reserve tracks the theme's gutter, which a copy of the number would not prove.
  const panelMarginBlock = () => {
    const themePath = path.resolve(expect.getState().testPath!, '../../../../styles/gallery-theme.css');
    // Comments stripped first: the theme documents each rule above it, and one of those
    // comments names `margin-block` while explaining why the top of it is zero.
    const css = readFileSync(themePath, 'utf8').replaceAll(/\/\*[\S\s]*?\*\//g, '');
    const rule = /main:has\(> div\.absolute\.overflow-y-auto\)\s*\{(?<body>[^{}]*)\}/.exec(css);
    return /margin-block:\s*(?<value>[^;]+);/.exec(rule!.groups!.body)!.groups!.value.trim();
  };

  it('leaves the panel no top margin of its own', () => {
    const [top, bottom] = panelMarginBlock().split(/\s+/, 2);

    expect(top).toBe('0');
    // Guards a vacuous read: a one-value `margin-block` would make the split return undefined
    // for the bottom and still satisfy the assertion above for the wrong reason.
    expect(bottom).toMatch(/^\d+px$/);
  });

  // With a navbar the band is the navbar, full stop - no padding may sit between it and the
  // panel, or the gutter would be counted twice and the field would look high instead of low.
  it('takes the whole band from the navbar height when a navbar is rendered', () => {
    render(UserPageLayout);

    const grid = screen.getByTestId('user-page-grid');
    expect(grid.className).toContain('h-[calc(100dvh-var(--navbar-height))]');
    expect(grid.className).not.toMatch(/\bp[ty]-/);
  });

  // With the navbar hidden an 80px ControlAppBar floats over the page instead, and the reserve
  // that clears it is 76px - it only ever cleared the bar because the panel's margin sat on top
  // of it. Losing that margin without adding it back here slides the panel under the bar.
  it('adds the panel gutter to the ControlAppBar reserve when the navbar is hidden', () => {
    const [, gutter] = panelMarginBlock().split(/\s+/, 2);

    render(UserPageLayout, { props: { hideNavbar: true } });

    const grid = screen.getByTestId('user-page-grid');
    expect(grid.className).toContain(`pt-[calc(var(--control-bar-height)+${gutter})]`);
    expect(grid.className).toContain(`max-md:pt-[calc(var(--control-bar-height-md)+${gutter})]`);
  });
});

// Local Omarchy layer: at the tightest step the page's own buttons fold into one ⋮ (utils/page-bar-fit). happy-dom
// lays nothing out, so the bar is made to crowd here: wider than its room at every step before the fold.
describe('UserPageLayout fold', () => {
  const ownDescriptors = {
    scrollWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth'),
    clientWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth'),
  };
  const isBar = (element: HTMLElement) => element.classList.contains('ws-page-bar');

  beforeEach(() => {
    layoutMocks.sidebarModeStore.layout = 'expanded';
    Object.defineProperties(HTMLElement.prototype, {
      scrollWidth: {
        configurable: true,
        get(this: HTMLElement) {
          return isBar(this) && this.dataset.fit !== '4' ? 500 : 0;
        },
      },
      clientWidth: {
        configurable: true,
        get(this: HTMLElement) {
          return isBar(this) ? 300 : 0;
        },
      },
    });
  });

  afterEach(() => {
    for (const [name, descriptor] of Object.entries(ownDescriptors)) {
      if (descriptor) {
        Object.defineProperty(HTMLElement.prototype, name, descriptor);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, name);
      }
    }
  });

  const bar = () => document.querySelector<HTMLElement>('.ws-page-bar')!;
  const tightest = () => waitFor(() => expect(bar()).toHaveAttribute('data-fit', '4'));

  it('folds two or more of the page buttons into the ⋮, rendered once', async () => {
    render(UserPageLayoutFoldTestWrapper, { props: { count: 2 } });
    await tightest();

    expect(bar()).toHaveAttribute('data-fold');
    // the name gets the room the buttons gave up
    expect(bar()).not.toHaveAttribute('data-capped');
    const fold = screen.getByTestId('page-fold');
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    expect(fold).toHaveAttribute('aria-controls', screen.getByTestId('page-actions').id);
    // one render of the page's buttons: inline or in the sheet, never both
    expect(document.querySelectorAll('button[aria-label="Tool 1"]')).toHaveLength(1);
    expect(screen.getByTestId('page-actions')).toContainElement(document.querySelector('[aria-label="Tool 2"]'));
  });

  it('opens the sheet with the labels back and closes it behind an action', async () => {
    const onPress = vi.fn();
    render(UserPageLayoutFoldTestWrapper, { props: { count: 2, onPress } });
    await tightest();

    await fireEvent.click(screen.getByTestId('page-fold'));
    expect(bar()).toHaveAttribute('data-open');
    expect(screen.getByTestId('page-fold')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('group', { name: 'more' })).toBe(screen.getByTestId('page-actions'));
    // an icon alone shows its name in the sheet
    const tool = document.querySelector<HTMLElement>('button[aria-label="Tool 2"]')!;
    expect(tool).toHaveAttribute('data-fold-label', 'Tool 2');

    await fireEvent.click(tool);
    expect(onPress).toHaveBeenCalledWith('Tool 2');
    expect(bar()).not.toHaveAttribute('data-open');
    expect(screen.getByTestId('page-fold')).toHaveFocus();
  });

  it('keeps the sheet open under a control that opens a list of its own', async () => {
    render(UserPageLayoutFoldTestWrapper, { props: { count: 1, withSort: true } });
    await tightest();

    await fireEvent.click(screen.getByTestId('page-fold'));
    await fireEvent.click(screen.getByRole('button', { name: 'Sort' }));

    expect(bar()).toHaveAttribute('data-open');
  });

  it('closes the sheet on Escape before the page hears it', async () => {
    const pageEscape = vi.fn();
    document.body.addEventListener('keydown', pageEscape);
    render(UserPageLayoutFoldTestWrapper, { props: { count: 3 } });
    await tightest();

    await fireEvent.click(screen.getByTestId('page-fold'));
    await fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(bar()).not.toHaveAttribute('data-open');
    expect(pageEscape).not.toHaveBeenCalled();
    document.body.removeEventListener('keydown', pageEscape);
  });

  it('closes the sheet on a press outside it', async () => {
    render(UserPageLayoutFoldTestWrapper, { props: { count: 2 } });
    await tightest();

    await fireEvent.click(screen.getByTestId('page-fold'));
    await fireEvent.pointerDown(document.body);

    expect(bar()).not.toHaveAttribute('data-open');
  });

  it('keeps a single control inline', async () => {
    render(UserPageLayoutFoldTestWrapper, { props: { count: 1 } });
    await tightest();

    expect(bar()).not.toHaveAttribute('data-fold');
    expect(screen.getByTestId('page-actions')).not.toHaveAttribute('role');
  });

  it('gives a page without buttons of its own the whole bar from the start', async () => {
    render(UserPageLayoutFoldTestWrapper, { props: { count: 0 } });
    await tightest();

    expect(bar()).not.toHaveAttribute('data-capped');
    expect(bar()).not.toHaveAttribute('data-fold');
  });
});
