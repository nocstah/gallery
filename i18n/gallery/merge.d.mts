/** Build-time API shared by the web Vite config and standalone consumers. */
export const mergedDir: string;
export function writeMergedI18n(outDir?: string): void;

interface I18nWatcher {
  add(paths: string[]): unknown;
  on(event: 'change' | 'add' | 'unlink', listener: (path: string) => void): I18nWatcher;
}

export function galleryI18nVitePlugin(): {
  name: string;
  configureServer(server: { watcher: I18nWatcher }): void;
};
