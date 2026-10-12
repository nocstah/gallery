// Local Omarchy layer: videos made ready for a chat app on request. The photo viewer's and the tile menu's "Download
// for WhatsApp / Telegram" start one here: Curator makes the file (share.video on its applier, curator/share.py:
// H.264 and AAC in an MP4 the app plays in the chat, sized for its limits), this follows the job and has the browser
// save the file once it is ready. A video asked for again within a week comes straight from Curator's copy.
// components/omarchy/ShareVideoPanel.svelte lists them while they are made.
import { curator, CuratorError, shareVideoUrl, waitForJob, type ShareApp, type ShareResult } from '$lib/utils/curator';

/** the apps as they call themselves (brand names, the same in every language) */
export const SHARE_APPS: Record<ShareApp, string> = { whatsapp: 'WhatsApp', telegram: 'Telegram' };

export type ShareItem = {
  key: string;
  assetId: string;
  app: ShareApp;
  /** what the row says until the file has its own name */
  label: string;
  status: 'making' | 'ready' | 'failed';
  /** 0 to 1 while it is made */
  progress: number;
  result?: ShareResult;
  error?: string;
};

class ShareVideoManager {
  items = $state<ShareItem[]>([]);

  /** Make the video ready for the app, then save it. A video already being made for that app is left to finish. */
  start(assetId: string, app: ShareApp, label: string) {
    const key = `${assetId}:${app}`;
    if (this.#item(key)?.status === 'making') {
      return;
    }
    this.items = [
      { key, assetId, app, label, status: 'making', progress: 0 },
      ...this.items.filter((item) => item.key !== key),
    ];
    void this.#make(key);
  }

  #item(key: string) {
    return this.items.find((item) => item.key === key);
  }

  async #make(key: string) {
    const item = this.#item(key);
    if (!item) {
      return;
    }
    try {
      const answer = await curator.shareVideo(item.assetId, item.app);
      let result = answer.ready;
      if (!result && answer.job !== undefined) {
        const job = await waitForJob(answer.job, (row) => {
          const live = this.#item(key);
          if (live && row.progress?.total) {
            live.progress = Math.min(1, (row.progress.done ?? 0) / row.progress.total);
          }
        });
        if (job?.status !== 'done' || !job.result) {
          throw new CuratorError(job?.error ?? 'The video could not be made', 0);
        }
        result = job.result as unknown as ShareResult;
      }
      const live = this.#item(key);
      if (!live || !result) {
        return;
      }
      live.status = 'ready';
      live.progress = 1;
      live.result = result;
      live.label = result.name;
      this.save(live);
    } catch (error) {
      const live = this.#item(key);
      if (live) {
        live.status = 'failed';
        live.error = error instanceof Error ? error.message : String(error);
      }
    }
  }

  /** The browser saves the file (Curator sends it as an attachment, under the name it gave it). */
  save(item: ShareItem) {
    const link = document.createElement('a');
    link.href = shareVideoUrl(item.assetId, item.app);
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
  }

  retry(key: string) {
    const item = this.#item(key);
    if (item) {
      this.start(item.assetId, item.app, item.label);
    }
  }

  /** The panel's close: the finished ones go, those still being made stay. */
  clearDone() {
    this.items = this.items.filter((item) => item.status === 'making');
  }
}

export const shareVideos = new ShareVideoManager();
