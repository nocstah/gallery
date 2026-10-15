import { deleteAssets, getAssetInfo } from '@immich/sdk';
import { toastManager } from '@immich/ui';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';
import { goto } from '$app/navigation';
import SavedFrameToast from '$lib/components/curator/SavedFrameToast.svelte';
import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
import { undoManager } from '$lib/managers/undo-manager.svelte';
import { Route } from '$lib/route';
import { curator, CuratorError, waitForJob, type SavedFrame } from '$lib/utils/curator';
import { navigate } from '$lib/utils/navigation';
import { undone } from '$lib/utils/undoable';

// Local Omarchy layer: Save frame as photo, Apple Photos' "Save Video Frame as Photo" in the viewer. The video on
// screen (VideoNativeViewer shows itself here) stops on the frame it is at, and Curator saves that frame as a new
// photo (frame.save, ~/code/curator/curator/stills.py): read from the original file at the video's own size, upright,
// HDR tone-mapped as the playback copy is, dated at the video's start plus the moment, with its place and camera, so
// it sorts beside the video. As in Apple Photos it is a photo of its own in the library: not stacked with the video,
// in none of its albums. The bar's button spins while Curator works (a second or two), then a toast says so with View
// and Undo; the undo goes into the undo history (the bar, Ctrl+Z) and trashes the photo with the user's own session,
// since Curator's key cannot delete.

/** how often the job is asked about: it is done in a second or two */
const POLL_MS = 400;
// as long as the toasts that offer an Undo (utils/undoable)
const TOAST_MS = 8000;
// View asks this often whether Gallery has drawn the photo yet, this many times
const DRAWN_MS = 300;
const DRAWN_TRIES = 20;

/** a video on screen, and the viewer's asset it plays (a Live Photo's photo while its video half plays) */
type OnScreen = { element: HTMLVideoElement; assetId: string };

class SaveFrameState {
  available = $state(false);
  /** the assets whose frame Curator is saving now */
  saving = $state<string[]>([]);
  // raw: the player's own element, and the detach below knows its registration by identity
  #video = $state.raw<OnScreen>();
  #checked = false;

  /** Ask Curator once whether it saves frames (an older one does not, and the button stays away). */
  check() {
    if (this.#checked) {
      return;
    }
    this.#checked = true;
    curator
      .kinds()
      .then((kinds) => (this.available = kinds.some(({ kind }) => kind === 'frame.save')))
      .catch(() => (this.available = false));
  }

  /** The video on screen; the returned function forgets it again (when its player goes). */
  show(element: HTMLVideoElement, assetId: string) {
    const shown: OnScreen = { element, assetId };
    this.#video = shown;
    return () => {
      if (this.#video === shown) {
        this.#video = undefined;
      }
    };
  }

  get video() {
    return this.#video;
  }

  isSaving(assetId: string | undefined) {
    return assetId !== undefined && this.saving.includes(assetId);
  }

  /** Save the frame the video on screen is on. A playing video stops there, so what is saved is what is seen. */
  async save() {
    const video = this.#video;
    if (!video || this.isSaving(video.assetId)) {
      return;
    }
    const { element, assetId } = video;
    element.pause();
    const seconds = element.currentTime;
    this.saving = [...this.saving, assetId];
    const translate = get(t);
    try {
      const { job } = await curator.saveFrame(assetId, seconds);
      const row = await waitForJob(job, undefined, POLL_MS);
      if (row?.status !== 'done' || typeof row.result?.asset_id !== 'string') {
        throw new CuratorError((row?.error ?? '').split('\n', 1)[0] || translate('errors.something_went_wrong'), 0);
      }
      saved(assetId, row.result as unknown as SavedFrame);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      toastManager.danger(translate('save_frame_failed', { values: { reason } }));
    } finally {
      this.saving = this.saving.filter((id) => id !== assetId);
    }
  }

  /** for tests: forget Curator's answer and the video */
  reset() {
    this.available = false;
    this.saving = [];
    this.#video = undefined;
    this.#checked = false;
  }
}

/** The toast, with View and Undo, and the undo kept in the history once the toast is gone. */
const saved = (from: string, frame: SavedFrame) => {
  const translate = get(t);
  const label = translate('saved_as_photo');
  const entry = undoManager.record(
    label,
    () => trash(from, frame.asset_id, label),
    translate('errors.unable_to_delete_assets'),
  );
  toastManager.custom(
    {
      component: SavedFrameToast,
      props: {
        description: label,
        onView: async () => {
          await drawn(frame.asset_id);
          await goto(Route.viewAsset({ id: frame.asset_id }));
        },
        onUndo: () => undoManager.undo(entry),
        onClose: () => {},
      },
    },
    { timeout: TOAST_MS },
  );
};

/** Gallery draws a new photo's previews a moment after it arrives (its thumbhash comes with them), and the viewer has
 * nothing to show before that: View waits for them, a few seconds at most. */
const drawn = async (id: string) => {
  for (let tries = 0; tries < DRAWN_TRIES; tries++) {
    try {
      const asset = await getAssetInfo({ id });
      if (asset.thumbhash) {
        return;
      }
    } catch {
      // not readable yet: ask again
    }
    await new Promise((resolve) => setTimeout(resolve, DRAWN_MS));
  }
};

/** The undo: the photo to the trash; a viewer showing it goes back to where it was taken from. */
const trash = async (from: string, id: string, label: string) => {
  await deleteAssets({ assetBulkDeleteDto: { ids: [id], force: false } });
  if (assetViewerManager.asset?.id === id) {
    await navigate({ targetRoute: 'current', assetId: from });
  }
  return undone(label);
};

export const saveFrame = new SaveFrameState();
