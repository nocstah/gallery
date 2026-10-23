import type { SharedSpaceMemberResponseDto, SharedSpaceResponseDto } from '@immich/sdk';
import { SharedSpaceRole } from '@immich/sdk';
import { modalManager, toastManager } from '@immich/ui';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import SpaceLayout from './+layout.svelte';

const { mockPage, mockAuthManager, gotoMock, invalidateAllMock } = vi.hoisted(() => ({
  mockPage: { url: new URL('https://gallery.test/spaces/s1'), route: { id: '/(user)/spaces/[spaceId]' } },
  mockAuthManager: { user: { id: 'u1', isAdmin: false } },
  gotoMock: vi.fn().mockResolvedValue(undefined),
  invalidateAllMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('$app/state', () => ({ page: mockPage }));
vi.mock('$app/navigation', () => ({ goto: gotoMock, invalidateAll: invalidateAllMock }));
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: mockAuthManager }));
// SpaceTabs gates its Map tab on the `map` feature flag (#1046); the root layout inits it in the app.
vi.mock('$lib/managers/feature-flags-manager.svelte', () => ({ featureFlagsManager: { value: { map: true } } }));

// The overflow handlers call into @immich/ui's modalManager (confirm dialogs, link-libraries modal)
// and toastManager — mock those while keeping the real Button/IconButton/Icon/TooltipProvider so the
// rendered overflow menu and its MenuOptions stay interactive (mirrors space-people-page.spec).
vi.mock('@immich/ui', async (importOriginal) => {
  const original = await importOriginal<typeof import('@immich/ui')>();
  return {
    ...original,
    modalManager: { show: vi.fn(), showDialog: vi.fn() },
    toastManager: { danger: vi.fn(), primary: vi.fn(), success: vi.fn(), warning: vi.fn() },
  };
});

// The real UserPageLayout mounts the NavigationBar (which needs a Tooltip provider); the shared
// mock renders the leading/buttons/children snippets inside a TooltipProvider — matching the other
// space page specs — so the app-bar testids are reachable.
vi.mock('$lib/components/layouts/UserPageLayout.svelte', async () => {
  const { default: MockComponent } = await import('$lib/components/spaces/mock-user-page-layout.test-wrapper.svelte');
  return { default: MockComponent };
});

const space = (o: Partial<SharedSpaceResponseDto> = {}): SharedSpaceResponseDto =>
  ({
    id: 's1',
    name: 'Trip',
    assetCount: 35,
    memberCount: 1,
    faceRecognitionEnabled: false,
    hasPets: false,
    petsEnabled: false,
    ...o,
  }) as never;
const member = (o: Partial<SharedSpaceMemberResponseDto> = {}): SharedSpaceMemberResponseDto =>
  ({
    userId: 'u1',
    role: SharedSpaceRole.Owner,
    name: 'Me',
    email: 'me@x.io',
    showInTimeline: true,
    sharePersonMetadata: true,
    ...o,
  }) as never;

function renderLayout(
  role: SharedSpaceRole,
  options: {
    isAdmin?: boolean;
    space?: SharedSpaceResponseDto;
    member?: SharedSpaceMemberResponseDto;
    linkedAlbums?: unknown[];
  } = {},
) {
  const { isAdmin = false } = options;
  mockAuthManager.user = { id: 'u1', isAdmin };
  // `children` is optional; the layout renders `{@render children?.()}`, so omitting it is fine.
  return render(SpaceLayout, {
    data: {
      space: options.space ?? space(),
      members: [options.member ?? member({ role })],
      linkedAlbums: options.linkedAlbums ?? [],
    } as never,
  });
}

// The overflow lives in the shell layout's app bar; open it, then click a MenuOption by its label.
// `svelte-i18n` returns raw keys in the test setup, so the labels match the i18n keys verbatim.
async function openOverflow() {
  const overflow = screen.getByTestId('space-overflow');
  // The trigger is the IconButton inside the overflow wrapper, labelled with the `more` key.
  await fireEvent.click(within(overflow).getByLabelText('more'));
}

async function clickOverflowOption(label: string) {
  await openOverflow();
  // Scoped to the overflow: the hero's ✎ menu also renders a "spaces_edit" option (SpaceHero's
  // ButtonContextMenu keeps its content mounted, just visually hidden, when closed), so an
  // unscoped screen-wide query is ambiguous once both menus offer the same label.
  const overflow = screen.getByTestId('space-overflow');
  await fireEvent.click(await within(overflow).findByText(label));
}

describe('space [spaceId] +layout.svelte', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    invalidateAllMock.mockResolvedValue(undefined);
    gotoMock.mockResolvedValue(undefined);
    mockPage.url = new URL('https://gallery.test/spaces/s1');
    const { spaceUiManager } = await import('$lib/managers/space-ui-manager.svelte');
    spaceUiManager.reset();
  });

  it('shows ＋ Add photos and the overflow for an editor', () => {
    renderLayout(SharedSpaceRole.Editor);
    expect(screen.getByTestId('space-add-photos')).toBeInTheDocument();
    expect(screen.getByTestId('space-overflow')).toBeInTheDocument();
  });

  it('hides ＋ Add photos for a viewer', () => {
    renderLayout(SharedSpaceRole.Viewer);
    expect(screen.queryByTestId('space-add-photos')).not.toBeInTheDocument();
  });

  // Local Omarchy layer: leaving the Space through Photos in the sidebar hands the layout the next page's data (no
  // space) a moment before it unmounts; reading `space.name` then threw and the navigation stalled on the Space.
  it('keeps its own Space while the next page, which has none, takes over', async () => {
    const { rerender } = renderLayout(SharedSpaceRole.Editor);
    await rerender({ data: { meta: { title: 'Photos' } } as never });
    expect(screen.getByTestId('space-overflow')).toBeInTheDocument();
  });

  it('records an add-photos intent and navigates to the Photos route when ＋ is clicked', async () => {
    const { spaceUiManager } = await import('$lib/managers/space-ui-manager.svelte');
    mockPage.url = new URL('https://gallery.test/spaces/s1/members');
    renderLayout(SharedSpaceRole.Editor);
    screen.getByTestId('space-add-photos').click();
    expect(spaceUiManager.intent).toBe('add-assets');
    expect(gotoMock).toHaveBeenCalledWith('/spaces/s1');
  });

  it('records an add-photos intent but does NOT navigate when already on the Photos base route', async () => {
    const { spaceUiManager } = await import('$lib/managers/space-ui-manager.svelte');
    mockPage.url = new URL('https://gallery.test/spaces/s1');
    renderLayout(SharedSpaceRole.Editor);
    screen.getByTestId('space-add-photos').click();
    expect(spaceUiManager.intent).toBe('add-assets');
    expect(gotoMock).not.toHaveBeenCalled();
  });

  describe('overflow handlers', () => {
    // #1041 regression guard: the space-level switch and the album-level "my timeline" switch
    // used to share the literal key `spaces_hide_from_timeline` / rendered string "Hide from
    // timeline". `svelte-i18n` returns raw keys in this test setup, so asserting the exact key
    // here pins that they no longer collide with the album kebab's `space_albums_hide_from_my_*`
    // keys (see space-album-card.spec.ts / space-albums-table.spec.ts for the album side).
    it('renders a DIFFERENT key than the album kebab\'s "my timeline" toggle (#1041 regression guard)', async () => {
      renderLayout(SharedSpaceRole.Owner, { member: member({ role: SharedSpaceRole.Owner, showInTimeline: true }) });

      await openOverflow();

      expect(screen.getByText('spaces_hide_from_timeline')).toBeInTheDocument();
      expect(screen.queryByText('space_albums_hide_from_my_timeline')).not.toBeInTheDocument();
    });

    it('handleToggleTimeline: hides the space from the timeline and revalidates', async () => {
      sdkMock.getTimelineHidePreview.mockResolvedValue({ hiddenAssetCount: 12, retainedAssetCount: 0 });
      vi.mocked(modalManager.show).mockResolvedValue(true as never);
      renderLayout(SharedSpaceRole.Owner, { member: member({ role: SharedSpaceRole.Owner, showInTimeline: true }) });

      await clickOverflowOption('spaces_hide_from_timeline');

      await waitFor(() => expect(sdkMock.getTimelineHidePreview).toHaveBeenCalledWith({ id: 's1' }));
      expect(modalManager.show).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ spaceName: 'Trip', count: 12, retainedCount: 0 }),
      );
      expect(sdkMock.updateMemberTimeline).toHaveBeenCalledWith({
        id: 's1',
        sharedSpaceMemberTimelineDto: { showInTimeline: false },
      });
      await waitFor(() => expect(invalidateAllMock).toHaveBeenCalled());
    });

    // #1041 follow-up: the count that explains a surprisingly small hiddenAssetCount has to reach
    // the dialog, or the user sees "removes 3 photos" about a 58,977-photo space with no context.
    it('handleToggleTimeline: passes the rescued-photo count through to the dialog', async () => {
      sdkMock.getTimelineHidePreview.mockResolvedValue({ hiddenAssetCount: 3, retainedAssetCount: 56_417 });
      vi.mocked(modalManager.show).mockResolvedValue(true as never);
      renderLayout(SharedSpaceRole.Owner, { member: member({ role: SharedSpaceRole.Owner, showInTimeline: true }) });

      await clickOverflowOption('spaces_hide_from_timeline');

      await waitFor(() => expect(modalManager.show).toHaveBeenCalled());
      expect(modalManager.show).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ count: 3, retainedCount: 56_417 }),
      );
    });

    it('handleToggleTimeline: does nothing when the hide confirm dialog is dismissed', async () => {
      sdkMock.getTimelineHidePreview.mockResolvedValue({ hiddenAssetCount: 12 });
      vi.mocked(modalManager.show).mockResolvedValue(false as never);
      renderLayout(SharedSpaceRole.Owner, { member: member({ role: SharedSpaceRole.Owner, showInTimeline: true }) });

      await clickOverflowOption('spaces_hide_from_timeline');

      await waitFor(() => expect(modalManager.show).toHaveBeenCalled());
      expect(sdkMock.updateMemberTimeline).not.toHaveBeenCalled();
    });

    it('handleToggleTimeline: shows the space on the timeline when currently hidden', async () => {
      renderLayout(SharedSpaceRole.Owner, { member: member({ role: SharedSpaceRole.Owner, showInTimeline: false }) });

      await clickOverflowOption('spaces_show_on_timeline');

      expect(sdkMock.updateMemberTimeline).toHaveBeenCalledWith({
        id: 's1',
        sharedSpaceMemberTimelineDto: { showInTimeline: true },
      });
      await waitFor(() => expect(invalidateAllMock).toHaveBeenCalled());
    });

    it('handleTogglePersonMetadataSharing: stops sharing person metadata and revalidates', async () => {
      renderLayout(SharedSpaceRole.Owner, {
        member: member({ role: SharedSpaceRole.Owner, sharePersonMetadata: true }),
      });

      await clickOverflowOption('spaces_stop_sharing_person_metadata');

      expect(sdkMock.updateMemberPreferences).toHaveBeenCalledWith({
        id: 's1',
        sharedSpaceMemberPreferencesDto: { sharePersonMetadata: false },
      });
      await waitFor(() => expect(invalidateAllMock).toHaveBeenCalled());
    });

    it('handleTogglePersonMetadataSharing: resumes sharing person metadata when currently off', async () => {
      renderLayout(SharedSpaceRole.Owner, {
        member: member({ role: SharedSpaceRole.Owner, sharePersonMetadata: false }),
      });

      await clickOverflowOption('spaces_share_person_metadata');

      expect(sdkMock.updateMemberPreferences).toHaveBeenCalledWith({
        id: 's1',
        sharedSpaceMemberPreferencesDto: { sharePersonMetadata: true },
      });
      await waitFor(() => expect(invalidateAllMock).toHaveBeenCalled());
    });

    it('handleDelete: removes the space and navigates to the spaces route when confirmed', async () => {
      vi.mocked(modalManager.showDialog).mockResolvedValue(true);
      renderLayout(SharedSpaceRole.Owner);

      await clickOverflowOption('spaces_delete');

      await waitFor(() => expect(sdkMock.removeSpace).toHaveBeenCalledWith({ id: 's1' }));
      expect(gotoMock).toHaveBeenCalledWith('/spaces');
    });

    it('handleDelete: does nothing when the confirm dialog is dismissed', async () => {
      vi.mocked(modalManager.showDialog).mockResolvedValue(false);
      renderLayout(SharedSpaceRole.Owner);

      await clickOverflowOption('spaces_delete');

      await waitFor(() => expect(modalManager.showDialog).toHaveBeenCalled());
      expect(sdkMock.removeSpace).not.toHaveBeenCalled();
      expect(gotoMock).not.toHaveBeenCalled();
    });

    it('does NOT offer a hide/show people toggle in the overflow', async () => {
      renderLayout(SharedSpaceRole.Owner, { space: space({ faceRecognitionEnabled: false }) });

      await openOverflow();

      expect(screen.queryByText('spaces_show_people')).not.toBeInTheDocument();
      expect(screen.queryByText('spaces_hide_people')).not.toBeInTheDocument();
    });

    it('does NOT offer link-libraries in the overflow for an admin (moved to the Libraries tab)', async () => {
      renderLayout(SharedSpaceRole.Owner, { isAdmin: true });

      await openOverflow();

      expect(screen.queryByText('spaces_link_libraries')).not.toBeInTheDocument();
    });

    it('offers "Leave space" in the overflow for a non-owner member', async () => {
      renderLayout(SharedSpaceRole.Editor, { member: member({ role: SharedSpaceRole.Editor }) });

      await openOverflow();

      expect(screen.getByText('spaces_leave')).toBeInTheDocument();
    });

    it('does NOT offer "Leave space" to the owner', async () => {
      renderLayout(SharedSpaceRole.Owner, { member: member({ role: SharedSpaceRole.Owner }) });

      await openOverflow();

      expect(screen.queryByText('spaces_leave')).not.toBeInTheDocument();
    });

    it('handleLeave: removes the current user from the space and navigates to the spaces list when confirmed', async () => {
      vi.mocked(modalManager.showDialog).mockResolvedValue(true);
      renderLayout(SharedSpaceRole.Editor, { member: member({ role: SharedSpaceRole.Editor }) });

      await clickOverflowOption('spaces_leave');

      await waitFor(() => expect(sdkMock.removeMember).toHaveBeenCalledWith({ id: 's1', userId: 'u1' }));
      expect(gotoMock).toHaveBeenCalledWith('/spaces');
    });

    it('handleLeave: does nothing when the confirm dialog is dismissed', async () => {
      vi.mocked(modalManager.showDialog).mockResolvedValue(false);
      renderLayout(SharedSpaceRole.Editor, { member: member({ role: SharedSpaceRole.Editor }) });

      await clickOverflowOption('spaces_leave');

      await waitFor(() => expect(modalManager.showDialog).toHaveBeenCalled());
      expect(sdkMock.removeMember).not.toHaveBeenCalled();
      expect(gotoMock).not.toHaveBeenCalled();
    });

    it('handleLeave: uses the plain confirmation when the leaving member has no linked albums', async () => {
      vi.mocked(modalManager.showDialog).mockResolvedValue(false);
      renderLayout(SharedSpaceRole.Editor, {
        member: member({ role: SharedSpaceRole.Editor }),
        linkedAlbums: [{ addedById: 'someone-else' }],
      });

      await clickOverflowOption('spaces_leave');

      await waitFor(() =>
        expect(modalManager.showDialog).toHaveBeenCalledWith(
          expect.objectContaining({ prompt: 'spaces_leave_confirmation' }),
        ),
      );
    });

    it('handleLeave: warns that linked albums will be removed when the leaving member linked albums of their own (L16)', async () => {
      vi.mocked(modalManager.showDialog).mockResolvedValue(false);
      renderLayout(SharedSpaceRole.Editor, {
        member: member({ role: SharedSpaceRole.Editor }),
        linkedAlbums: [{ addedById: 'u1' }],
      });

      await clickOverflowOption('spaces_leave');

      await waitFor(() =>
        expect(modalManager.showDialog).toHaveBeenCalledWith(
          expect.objectContaining({ prompt: 'spaces_leave_confirmation_with_albums' }),
        ),
      );
    });

    it('handleBulkAddAssets: bulk-adds assets for an editor when confirmed', async () => {
      vi.mocked(modalManager.showDialog).mockResolvedValue(true);
      renderLayout(SharedSpaceRole.Editor, { member: member({ role: SharedSpaceRole.Editor }) });

      await clickOverflowOption('add_all_photos');

      await waitFor(() => expect(sdkMock.bulkAddAssets).toHaveBeenCalledWith({ id: 's1' }));
      expect(toastManager.success).toHaveBeenCalled();
    });

    it('handleBulkAddAssets: does nothing when the confirm dialog is dismissed', async () => {
      vi.mocked(modalManager.showDialog).mockResolvedValue(false);
      renderLayout(SharedSpaceRole.Editor, { member: member({ role: SharedSpaceRole.Editor }) });

      await clickOverflowOption('add_all_photos');

      await waitFor(() => expect(modalManager.showDialog).toHaveBeenCalled());
      expect(sdkMock.bulkAddAssets).not.toHaveBeenCalled();
    });

    it('handleTogglePets: toggles pet visibility for an owner when face recognition is on and pets exist', async () => {
      renderLayout(SharedSpaceRole.Owner, {
        space: space({ faceRecognitionEnabled: true, hasPets: true, petsEnabled: false }),
      });

      await clickOverflowOption('spaces_show_pets');

      expect(sdkMock.updateSpace).toHaveBeenCalledWith({
        id: 's1',
        sharedSpaceUpdateDto: { petsEnabled: true },
      });
      await waitFor(() => expect(invalidateAllMock).toHaveBeenCalled());
    });
  });

  // Local Omarchy layer: no cover over the page; the Space's sections sit in the bar beside its name
  it('puts the sections in the bar beside the name, with the album count', () => {
    renderLayout(SharedSpaceRole.Owner, { linkedAlbums: [{ id: 'a1' }, { id: 'a2' }] });
    const trailing = screen.getByTestId('layout-description-trailing');
    expect(within(trailing).getByTestId('space-tabs')).toBeInTheDocument();
    expect(within(trailing).getByTestId('space-tab-albums')).toHaveTextContent('2');
  });

  it('draws no cover over the page', () => {
    renderLayout(SharedSpaceRole.Owner);
    expect(screen.queryByTestId('space-hero')).not.toBeInTheDocument();
    expect(screen.queryByTestId('hero-title')).not.toBeInTheDocument();
  });

  it('shows a Space of one only the sections that mean something to one person, and keeps inviting in the menu', async () => {
    renderLayout(SharedSpaceRole.Owner, { linkedAlbums: [{ id: 'a1' }] });
    expect(screen.queryByTestId('space-tab-members')).not.toBeInTheDocument();
    expect(screen.queryByTestId('space-tab-activity')).not.toBeInTheDocument();
    await clickOverflowOption('invite_people');
    expect(gotoMock).toHaveBeenCalledWith('/spaces/s1/members');
  });

  it('leads a Space of one with its albums, its photos at /photos, where adding photos goes', async () => {
    const { spaceUiManager } = await import('$lib/managers/space-ui-manager.svelte');
    mockPage.url = new URL('https://gallery.test/spaces/s1/albums');
    renderLayout(SharedSpaceRole.Owner, { linkedAlbums: [{ id: 'a1' }] });
    const tabs = within(screen.getByTestId('space-tabs')).getAllByRole('link');
    expect(tabs[0]).toHaveAttribute('data-testid', 'space-tab-albums');
    expect(screen.getByTestId('space-tab-photos')).toHaveAttribute('href', '/spaces/s1/photos');
    screen.getByTestId('space-add-photos').click();
    expect(spaceUiManager.intent).toBe('add-assets');
    expect(gotoMock).toHaveBeenCalledWith('/spaces/s1/photos');
  });

  it('defers entirely to the child on a detail route — no nested shell chrome', () => {
    mockPage.url = new URL('https://gallery.test/spaces/s1/albums/al-1');
    renderLayout(SharedSpaceRole.Owner);
    // Detail pages render their OWN UserPageLayout; the shell must render bare children there,
    // otherwise the whole app nests inside itself.
    expect(screen.queryByTestId('space-tabs')).not.toBeInTheDocument();
    expect(screen.queryByTestId('space-add-photos')).not.toBeInTheDocument();
    expect(screen.queryByTestId('space-overflow')).not.toBeInTheDocument();
  });

  it('suppresses the app bar, tabs and cover when chrome is hidden (full-screen selection mode)', async () => {
    const { spaceUiManager } = await import('$lib/managers/space-ui-manager.svelte');
    spaceUiManager.setChromeHidden(true);
    renderLayout(SharedSpaceRole.Owner);
    expect(screen.queryByTestId('space-tabs')).not.toBeInTheDocument();
    expect(screen.queryByTestId('space-add-photos')).not.toBeInTheDocument();
  });

  describe('edit space', () => {
    it('offers Edit space to an owner', async () => {
      renderLayout(SharedSpaceRole.Owner);
      await openOverflow();
      // Scoped to the overflow: the hero's ✎ menu also offers "spaces_edit" for an owner/editor.
      expect(await within(screen.getByTestId('space-overflow')).findByText('spaces_edit')).toBeInTheDocument();
    });

    it('offers Edit space to an editor', async () => {
      renderLayout(SharedSpaceRole.Editor);
      await openOverflow();
      expect(await within(screen.getByTestId('space-overflow')).findByText('spaces_edit')).toBeInTheDocument();
    });

    it('does NOT offer Edit space to a viewer', async () => {
      renderLayout(SharedSpaceRole.Viewer);
      await openOverflow();
      expect(screen.queryByText('spaces_edit')).not.toBeInTheDocument();
    });

    it('opens the modal with the current space and revalidates after a saved edit', async () => {
      vi.mocked(modalManager.show).mockResolvedValue(true as never);
      renderLayout(SharedSpaceRole.Editor);

      await clickOverflowOption('spaces_edit');

      await waitFor(() => {
        expect(modalManager.show).toHaveBeenCalledWith(expect.anything(), {
          space: expect.objectContaining({ id: 's1' }),
        });
      });
      expect(invalidateAllMock).toHaveBeenCalled();
    });

    it('does not revalidate when the edit is cancelled', async () => {
      vi.mocked(modalManager.show).mockResolvedValue(undefined as never);
      renderLayout(SharedSpaceRole.Editor);

      await clickOverflowOption('spaces_edit');

      await waitFor(() => {
        expect(modalManager.show).toHaveBeenCalled();
      });
      expect(invalidateAllMock).not.toHaveBeenCalled();
    });
  });
});
