# Kioku

Local Omarchy layer. Kioku (記憶, "memory") is the name this family's archive goes by in the browser. It is a
build-time layer over Noodle's branding, like Noodle's own over Immich: `local-build.sh` copies the checkout, runs
Noodle's `branding/scripts/apply-branding.sh` on the copy, then `apply-kioku.sh`, checks the copy with
`verify-kioku.sh`, builds the web, and checks the built output again before anything is installed. The source keeps
upstream's words; nothing here ever edits a checkout.

| File               | What it is                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `brand.json`       | The single source of truth: the name, the words, the assets, the i18n classification, the keep list |
| `apply-kioku.sh`   | `apply-kioku.sh <copy root>`: the rewrite, in the copy, before the Docker build                |
| `verify-kioku.sh`  | `verify-kioku.sh <copy root \| build output>`: lists every brand name left, exit 1 off the keep list |
| `kioku.mjs`        | The engine both use (Node, no dependencies)                                                    |
| `assets/`          | The drawn icons, logos and link preview, once there are any                                    |

Text is rewritten in the copy, never in the build's output: SvelteKit precompresses the output (`.br`, `.gz`) and the
server sends those first. Every rewrite checks that it found the text it was written against, as often as it was, and
stops the build otherwise, naming the file and the text, so an upstream change cannot turn one into a silent no-op.
A second run changes nothing.

## What changes

- **The tabs.** Every page is `<page> - Kioku` (Room is `Room - Kioku`); a page without a title of its own, which
  the root layout's default covers (`/maintenance`, a few admin pages), is `Kioku` once, where it was
  `Immich - Noodle Gallery`. The error pages, a shared link's page and its ended page say Kioku too.
- **The inspector's window** is titled `Kioku inspector` while it loads and `Kioku inspector - Kioku` once the page
  has drawn: a window rule matches the start, `Kioku inspector`.
- **The installed app** (`manifest.json`): Kioku, short name Kioku, "The family's photos and videos", a white splash.
- **The words**, by the classification below, in every locale: "Search Kioku: try @ for people…", "Kioku isn't
  answering", "{name} runs Kioku", "Room can't reach Kioku right now", the admin pages' "Put Kioku into maintenance
  mode". Also the no-JavaScript line, the logo's alt text ("Kioku logo"), the theme importer's "not a Kioku theme"
  and the shared memory player's tab (`Kioku · Memory`, then `<memory> · Kioku`).
- **Help › About**, the owner's section beside the projects' links, says "Kioku is built on Noodle Gallery and
  Immich" (`about_credit`, in the ten maintained languages): the AGPL credit stays in front of the owner.
- **The icons, logos and link preview**, once `assets/` has them (below). The open-in-app banner keeps the phone
  app's own icon (`noodle-app-icon-180.png`, from Noodle's iOS launcher icon), since it offers the phone app.

## What stays Noodle Gallery or Immich, and why

- **The phone app** is Noodle's: built in Noodle's CI, named Noodle Gallery in the stores and on the phone. Its own
  screens' strings keep that name (`keep.phone_app`, none shown by a web page), and so do the web pages that point at
  it (`keep.phone_app_on_web`: the open-in-app banner, `/install`, the onboarding step, Obtainium), so the family
  looks for what they are told to look for.
- **The server image** is Noodle's: `local-build.sh` builds only the web. The emails (the server renders them from its
  own templates; their From name is the admin's setting, whose example now suggests Kioku), the server's own share
  tags ("Public Share"; their fallback image is the web's `/feature-panel.png`, so a drawn one reaches them), the API
  docs, the version check and the release announcement all come from the image. Strings about its releases and
  versions keep Noodle's name (`keep.server_releases`), and About › Server details lists the server's version as
  Noodle Gallery's.
- **Support and purchase** (`keep.purchase`) and **credits** (`keep.credits`: the project's documentation and
  resources, the About credit), and `security.txt`, which sends security reports to Noodle.
- **@immich/ui's own logo**, which only a modal given `icon={true}` draws, and none is. It lives in the image's
  installed packages, out of a source rewrite's reach.
- **Languages beyond the ten maintained** (en, de, fr, it, nl, pl, es, ru, zh_Hans, zh_Hant) get the name swapped as
  a word; a case ending or an article glued to it (Hungarian, Turkish, Catalan) is as `apply-branding.sh` left it.

`verify-kioku.sh` lists each of these with its reason every time it runs.

## The classification

Every string in the folded bundle (`i18n/*.json` after `apply-branding.sh`) that names a brand is listed in
`brand.json` under `i18n` exactly once:

- `kioku.noodle_gallery`: Noodle Gallery means this archive as people use it in the browser, and becomes Kioku;
- `kioku.gallery`: the overlay's strings where the bare word Gallery is the archive's name (it is never touched as a
  common noun, as in "Hide gallery");
- `keep.*`: it stays Noodle Gallery, for the reason the group gives;
- `restore`: `apply-branding.sh` read the `~/immich` directory in the Curator messages as the brand; it is put back;
- `phrases`: grammar the swap alone would break, applied first where listed: an article or demonstrative that agreed
  with Gallery ("diese Gallery" becomes "Kioku"), a case ending glued to the name.

`apply-kioku.sh` stops the build on a string that names a brand and is not listed, on a listed key that no longer
exists, on a Kioku or kept key that no longer names a brand anywhere, on a phrase that no longer matches its
translation, and on a rewrite that would change a message's placeholders or tags. After a rebase:

1. Run it without Docker on a scratch copy:

   ```sh
   rsync -a --delete --exclude node_modules --exclude .git ./ ~/.cache/kioku-check/
   (cd ~/.cache/kioku-check && ./branding/scripts/apply-branding.sh >/dev/null && ./branding/kioku/apply-kioku.sh .)
   ```

2. For each key it names, decide by what the name means there. The web experience (this archive, its pages,
   library, database, look) goes under `kioku`; the phone app, the server's releases, purchase and credits go under
   the matching `keep` group. Insert the key in order, and drop the ones it says upstream removed.
3. Read the key's rewritten strings in the ten maintained locales (`jq -r .<key> ~/.cache/kioku-check/i18n/de.json`
   and so on): where an article, a demonstrative or a case ending no longer agrees, add a phrase for that locale and
   key, with the whole new wording.
4. Run it again until it passes, then `verify-kioku.sh ~/.cache/kioku-check`.

A new web text outside the bundle (a title, an alt text) is a `rule` in `apply-kioku.sh`, with the count it must find.

## GALLERY_BRAND

`GALLERY_BRAND=noodle ./local-build.sh` builds Noodle Gallery's branding as it comes, without this layer, for a quick
unbranded build; so does a checkout without `branding/kioku/brand.json`. The default is `GALLERY_BRAND=kioku`.

## Assets

`brand.json` lists each source under `assets` with what it replaces in `web/static`. A source not drawn yet is a
warning, and Noodle's file stays; a counterpart the copy no longer has stops the build. Raster files are resized to
each size (a hand-drawn 16, 32 or 48 px favicon beats the resized one), written without timestamps;
`favicon.ico` is assembled from the 16, 32 and 48 px PNGs unless drawn.

| Source                                     | Becomes                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `favicon.png` (square, 256 px or more)     | `favicon.png`, `favicon-{256,144,96,48,32,16}.png`, `favicon.ico`             |
| `favicon-{48,32,16}.png` (optional)        | the small sizes, drawn for their pixels                                      |
| `app-icon.png` (opaque, 1024 px, maskable) | `manifest-icon-{512,192}.maskable.png`, `apple-icon-180.png`                 |
| `apple-icon-180.png` (optional)            | `apple-icon-180.png`                                                         |
| `feature-panel.png` (1200 × 630)           | the link preview of a shared link without a photo of its own                 |
| `logo-mark.svg`, `logo-mark-dark.svg`      | `gallery-logo-mark{,-dark}.svg`: the login backdrop, the icon-sized logos    |
| `loader.svg`, `loader-dark.svg`            | `gallery-loader{,-dark}.svg`: the loading mark, the login card's logo        |
| `logo-inline-{light,dark}.svg`             | `gallery-logo-inline-{light,dark}.svg`: the bar on a wide screen             |
| `logo-stacked.svg`, `logo-stacked-dark.svg` | `gallery-logo-stacked{,-dark}.svg`                                          |

## On the desktop, by hand

The rename reaches these only when they are edited too:

- `~/.config/hypr/gallery-inspector.lua` places the inspector by its title: it must match "^Kioku inspector".
- `~/.local/share/applications/Gallery.desktop`: its Name and Comment, and its Icon once the mark is drawn.
- `~/code/onthisday` and `~/code/photowall`: their manifests, tooltips and error lines say Gallery.
- `~/immich/public-links/theme/build.sh` writes the link pages' words from a checkout's unbranded i18n: point it at
  the build copy's branded bundle (`~/.cache/gallery-build/src/i18n`), so "Gallery isn't answering" says Kioku there
  too.
