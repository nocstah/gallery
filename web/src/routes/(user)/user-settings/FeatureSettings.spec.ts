import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { get } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sidebarRowsHidden } from '$lib/stores/sidebar-rows';
import FeatureSettings from './FeatureSettings.svelte';

const mocks = vi.hoisted(() => ({
  open: ['memories'],
  preferences: {} as Record<string, unknown>,
  serverConfig: {} as Record<string, unknown>,
  setPreferences: vi.fn(),
  updateMyPreferences: vi.fn(),
}));

vi.mock(import('$lib/managers/auth-manager.svelte'), () => ({
  authManager: {
    get preferences() {
      return mocks.preferences;
    },
    setPreferences: mocks.setPreferences,
  } as never,
}));

vi.mock(import('$lib/managers/server-config-manager.svelte'), () => ({
  serverConfigManager: {
    get value() {
      return mocks.serverConfig;
    },
  } as never,
}));

vi.mock(import('@immich/sdk'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, updateMyPreferences: mocks.updateMyPreferences };
});

// SettingAccordion drives open/close through accordionManager (which navigates via goto);
// stub it to keep the memories section open and avoid SvelteKit navigation in tests.
vi.mock(import('$lib/managers/accordion-manager.svelte'), () => ({
  accordionManager: {
    isOpen: (key: string) => mocks.open.includes(key),
    open: vi.fn(),
    close: vi.fn(),
  } as never,
}));

describe('FeatureSettings memory types', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.open = ['memories'];
    mocks.preferences = {
      memories: { enabled: true, duration: 5, types: { on_this_day: true, birthday: false, recent_trip: true } },
    };
    mocks.serverConfig = { availableMemoryTypes: ['on_this_day', 'birthday', 'recent_trip'] };
    mocks.updateMyPreferences.mockResolvedValue(mocks.preferences);
  });

  it('renders a toggle per available memory type reflecting the preference', () => {
    render(FeatureSettings);

    expect(screen.getByRole('switch', { name: 'memory_type_on_this_day' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'memory_type_birthday' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'memory_type_recent_trip' })).toBeChecked();
  });

  it('saves memory type changes without altering enabled or duration', async () => {
    const user = userEvent.setup();
    render(FeatureSettings);

    await user.click(screen.getByRole('switch', { name: 'memory_type_birthday' }));
    await user.click(screen.getByRole('button', { name: 'save' }));

    expect(mocks.updateMyPreferences).toHaveBeenCalledWith({
      userPreferencesUpdateDto: expect.objectContaining({
        memories: {
          enabled: true,
          duration: 5,
          types: { on_this_day: true, birthday: true, recent_trip: true },
          sidebarWeb: true,
        },
      }),
    });
  });

  it('does not render a toggle for an unavailable memory type', () => {
    mocks.serverConfig = { availableMemoryTypes: ['on_this_day', 'birthday'] };
    render(FeatureSettings);

    expect(screen.getByRole('switch', { name: 'memory_type_on_this_day' })).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'memory_type_recent_trip' })).toBeNull();
  });
});

describe('memories preference payload', () => {
  // The fork carries `types` (per-user memory-type map) alongside upstream's keys, all in a
  // single object literal in handleSave. An upstream merge that resolves that literal to one
  // side silently drops the other side's key -- and dropping `types` resets every user's
  // per-type memory preferences.
  //
  // Asserted with toEqual, not objectContaining: an exact match catches a dropped key AND
  // tells us when upstream adds one, which is the signal Task 3 acts on.
  it('sends every memories key, not just the ones upstream knows about', async () => {
    mocks.preferences = {
      memories: { enabled: true, duration: 5, types: { on_this_day: true, birthday: false } },
    };
    mocks.serverConfig = { availableMemoryTypes: ['on_this_day', 'birthday'] };
    mocks.updateMyPreferences.mockResolvedValue(mocks.preferences);

    const user = userEvent.setup();
    render(FeatureSettings);
    await user.click(screen.getByRole('button', { name: 'save' }));

    const payload = mocks.updateMyPreferences.mock.calls.at(-1)?.[0].userPreferencesUpdateDto;
    expect(payload.memories).toEqual({
      enabled: true,
      duration: 5,
      types: { on_this_day: true, birthday: false },
      // Upstream's key (immich-28675). The mock preferences omit it, so `true` here is also
      // the fork's D3 default surviving: upstream's component defaults it to `false`.
      sidebarWeb: true,
    });
  });
});

// Local Omarchy layer: People is in the sidebar unless hidden in this browser (stores/sidebar-rows), so the People
// section's Sidebar switch is this browser's, and saving leaves upstream's people.sidebarWeb as the server has it
describe("People's sidebar switch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.open = ['people'];
    mocks.preferences = { people: { enabled: true, sidebarWeb: false, minimumFaces: 3 } };
    mocks.serverConfig = { availableMemoryTypes: [], minFaces: 3 };
    mocks.updateMyPreferences.mockResolvedValue(mocks.preferences);
    sidebarRowsHidden.set({});
  });

  it('shows People in the sidebar here, whatever the server preference says', () => {
    render(FeatureSettings);

    expect(screen.getByRole('switch', { name: 'sidebar' })).toBeChecked();
  });

  it('hides People in this browser on Save, and sends no sidebar preference', async () => {
    const user = userEvent.setup();
    render(FeatureSettings);

    await user.click(screen.getByRole('switch', { name: 'sidebar' }));
    await user.click(screen.getByRole('button', { name: 'save' }));

    const payload = mocks.updateMyPreferences.mock.calls.at(-1)?.[0].userPreferencesUpdateDto;
    expect(payload.people).toEqual({ enabled: true, minimumFaces: 3 });
    expect(get(sidebarRowsHidden)).toEqual({ people: true });
  });

  it('shows it again from the switch', async () => {
    sidebarRowsHidden.set({ people: true });
    const user = userEvent.setup();
    render(FeatureSettings);

    expect(screen.getByRole('switch', { name: 'sidebar' })).not.toBeChecked();
    await user.click(screen.getByRole('switch', { name: 'sidebar' }));
    await user.click(screen.getByRole('button', { name: 'save' }));

    expect(get(sidebarRowsHidden)).toEqual({});
  });
});
