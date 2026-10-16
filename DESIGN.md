---
name: Noodle Gallery (local Omarchy layer)
description: The family archive set in the owner's own tiling desktop. Years are workspaces, photos are tiles on one gap, and the theme accent lights only what has focus.
colors:
  surface: "#ffffff"
  ink: "#1f1f1f"
  muted: "#5f6368"
  accent: "#0b57d0"
  hairline: "color-mix(in oklab, #1f1f1f 13%, transparent)"
  caption-scrim: "rgb(0 0 0 / 0.55)"
  caption-ink: "#ffffff"
typography:
  display:
    fontFamily: "'Bricolage Grotesque Variable', 'Mona Sans', ui-sans-serif, sans-serif"
    fontSize: "clamp(2.25rem, 1rem + 3vw, 4rem)"
    fontWeight: 800
    lineHeight: 0.85
    letterSpacing: "-0.035em"
    fontVariation: "'wdth' 75, 'opsz' 96"
  display-month:
    fontFamily: "'Bricolage Grotesque Variable', 'Mona Sans', ui-sans-serif, sans-serif"
    fontSize: "clamp(2.25rem, 1rem + 3vw, 4rem)"
    fontWeight: 500
    lineHeight: 0.85
    letterSpacing: "-0.035em"
    fontVariation: "'wdth' 75, 'opsz' 96"
  headline:
    fontFamily: "'Bricolage Grotesque Variable', 'Mona Sans', ui-sans-serif, sans-serif"
    fontSize: "clamp(1.75rem, 1.2rem + 1.6vw, 2.5rem)"
    fontWeight: 750
    lineHeight: 1.05
    letterSpacing: "-0.03em"
    fontVariation: "'wdth' 80, 'opsz' 72"
  title:
    fontFamily: "'Bricolage Grotesque Variable', 'Mona Sans', ui-sans-serif, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 650
    letterSpacing: "-0.01em"
    fontFeature: "'tnum'"
  heading:
    fontFamily: "'Mona Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 650
    lineHeight: 1.3
  body:
    fontFamily: "'Mona Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: "'ss01', 'ss02'"
  label:
    fontFamily: "'Mona Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
  meta:
    fontFamily: "'Mona Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
  data:
    fontFamily: "var(--omarchy-font-mono, 'JetBrainsMono Nerd Font'), 'GoogleSansCode', ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 600
    fontFeature: "'tnum'"
rounded:
  # every corner is the theme's --ws-radius exactly (square on the owner's theme); never radius + Npx
  window: "var(--ws-radius)"
  pill: "var(--ws-radius)"
  control: "var(--ws-radius)"
  segmented: "var(--ws-radius)"
spacing:
  gap: "10px"
  strip-step: "4px"
  header-top: "6px"
  header-bottom: "8px"
  header-split: "24px"
components:
  photo-tile:
    rounded: "{rounded.window}"
  year-pill:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.data}"
    rounded: "{rounded.pill}"
    padding: "0.3rem 0.55rem"
  year-pill-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    typography: "{typography.data}"
    rounded: "{rounded.pill}"
    padding: "0.3rem 0.55rem"
  sidebar-item-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
  segmented-control:
    backgroundColor: "transparent"
    rounded: "{rounded.segmented}"
    padding: "3px"
  segmented-option:
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
  segmented-option-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
  empty-action:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0.55rem 1rem"
  place-caption:
    backgroundColor: "{colors.caption-scrim}"
    textColor: "{colors.caption-ink}"
    padding: "1.5rem 0.6rem 0.45rem"
---

# Design System: Noodle Gallery (local Omarchy layer)

## Overview

**Creative North Star: "The Tiled Workspace"**

The archive is a workspace you live in, drawn in the grammar of the owner's own Omarchy/Hyprland desktop. Years are workspaces you switch between; photos are windows tiled on one even gap; the theme accent is the active border and lights only what has focus. The chrome is the same ground as the content, split by 1px hairlines, so the photos stay the brightest thing on screen.

This layer is a citizen of the desktop, not a brand. **Colour is not owned here.** The palette (`--immich-ui-light`, `--immich-ui-dark`, `--immich-ui-muted`, `--immich-ui-gray`, `--immich-ui-default-border`, the `--immich-ui-primary-*` ramp, the `--color-gray-*` ramp, `--omarchy-accent`, `--omarchy-on-accent`) and the desktop geometry and font (`--ws-gap`, `--ws-radius`, `--ws-border`, `--omarchy-font-mono`) arrive at runtime as admin Custom CSS that `~/.local/bin/immich-omarchy-theme` generates from the active Omarchy theme and Hyprland config (run by the theme-set and font-set hooks). `web/src/styles/omarchy-world.css` owns type, geometry rules, material, components, layout and motion, and only reads those tokens. Every colour and geometry value in the frontmatter is the build's **fallback** (the light face of `gallery-theme.css`, and the `:root` defaults in `omarchy-world.css`), shown when the hook has not run. Never hard-code a value from one theme.

The layer began visual only: it styles upstream markup through stable hooks (`data-testid`, `data-thumbnail-focus-container`, ids) and `ws-` classes added to upstream components. It is now a deliberate fork (PRODUCT.md, Change scope) that also owns screens and flows: the Time Strip, the sidebar's Album Tree, its Pinned albums and photos carried to it, the Explorer of Tags and Folders, the Shared feed and the Share sheet, the special albums, Bank slips, the tool pages (Duplicates, Manage location, Large files, Workflows, Import), Album folders, the Space page, Photo books, the Adjust panel and Curator's inbox and panels, each described under Components. A redesign may restructure a screen; every structural departure from upstream gets its entry under Components when it lands, so a merge of an upstream release knows what is ours.

**Key Characteristics:**
- One ground: the theme surface everywhere, divided by hairlines, never two-tone slabs.
- One gap module (`--ws-gap`, Hyprland `gaps_in` x2) spaces the tiles and derives the header rhythm.
- Tiles take the desktop's window radius and border width.
- Active state is inversion (ink fill, surface text), like the Omarchy bar's active workspace; the accent is reserved for focus.
- Scale contrast carries hierarchy: condensed heavy numerals at display size against 12px monospace data.
- Depth only on what floats (menus, dialogs, the floating grouping control).

## Colors

The palette is the active Omarchy theme, read at runtime; this system defines roles, not hues.

### Primary
- **Theme Accent** (`--ws-accent` = `var(--omarchy-accent, var(--immich-ui-primary-500))`; fallback in frontmatter `accent`): the active border. Used only for focus and response: the focused tile's border, `:focus-visible` outlines, text selection (26% mix), native `accent-color`, the hover underline of text links, and a 15% tint into the empty-state button on hover. Runtime source: the theme's accent from `colors.toml`, contrast-pushed by the hook.

### Neutral
- **Theme Surface** (`--immich-ui-light`; fallback `surface`): the single ground for page, top bar, sidebar, filter rail and floating controls. Also the text colour on inverted (active) elements.
- **Theme Ink** (`--immich-ui-dark`; fallback `ink`): primary text, display numerals, and the fill of every active/selected element.
- **Muted Ink** (`--immich-ui-muted`; fallback `muted`): secondary text: counts, inactive year pills, inactive segmented options, empty-state body. The hook pushes it to at least 4.6:1 against the surface.
- **Hairline** (`--ws-hairline` = ink at 13% in OKLab; fallback `hairline`): every divider, the tile's inactive border, control outlines, menu and dialog borders.
- **Caption Scrim / Caption Ink** (`caption-scrim`, `caption-ink`): fixed colours, and only on the photo itself: the bottom gradient (black 55% to transparent) and white text of the place caption. They sit on imagery, not on the theme.
- **QR Black / QR White**: the other fixed pair, a shared link's QR code (`components/omarchy/ShareLinkPanel.svelte`), black on a white quiet zone whatever the theme: a phone's camera needs the contrast and the quiet zone, and a dark theme would run into the code's edge. Like the caption, it is something to read off the screen, not chrome.

### Named Rules
**The Desktop Decides Rule.** No colour literal enters the build except the on-photo caption scrim and a QR code's black on white. New surfaces take roles (`--immich-ui-*`, `--ws-accent`, `--ws-hairline`), never hex values from the theme you happen to be looking at.

**The Active Border Rule.** The accent marks focus and only focus. Selection of a mode, a year or a nav item is shown by inversion (ink fill, surface text), never by accent fill. Upstream's own brand colour follows the rule at the token: Tailwind's `--color-primary` (in `omarchy-world.css`) and the legacy `immich-primary` / `immich-dark-primary` pair (at the end of `app.css`'s theme, which defines them after its imports) are ink, so stock and @immich/ui markup (titles, icons, chips, meters, filled buttons) take ink and inversion with no per-component override, and text that upstream set white or black on such a fill takes the surface. The raw `--immich-ui-primary-*` ramp keeps the theme's accent for `--ws-accent` (2026-10-15).

**The Hairline Rule.** Separation is a 1px hairline or nothing. No tinted panels, no slabs, no second background tone for chrome.

## Typography

**Display Font:** Bricolage Grotesque Variable (wght + wdth + opsz axes, fallback Mona Sans)
**Body Font:** Mona Sans variable (self-hosted, wght 200 to 900, stretch 75 to 125%, `ss01` + `ss02` on)
**Label/Mono Font:** the desktop's monospace (`--omarchy-font-mono` from the font-set hook; fallback JetBrainsMono Nerd Font, then GoogleSansCode)

**Delivery.** Bricolage is loaded once, as Fontsource's standard axis set (wght, wdth, opsz) from `omarchy-world.css`. Until 2026-10-15 `gallery-theme.css` also imported the wght-only build under the same family name, the browser picked it, and nothing but the bar's heading ever condensed (Years numerals, the AI inbox headline and empty-state titles ran wide); that import and the unused DM Sans are gone. Mona Sans is preloaded (`app.html`, filled by `hooks.server.ts`); upstream's Google Sans (4.8 MB) and Google Sans Code are no longer preloaded, and nothing shows them.

**Character:** Condensed, heavy grotesque numerals set the time like a poster; a neutral variable sans does the work; the desktop's own terminal font carries every number that is data.

### Hierarchy
One size per role, as tokens in `omarchy-world.css` (`--ws-text-*`, in rem so one root size scales them all, for a TV); components use the token, never a literal size:
display `clamp(2.25rem, 1rem + 3vw, 4rem)` · title 1.25rem · heading 1.125rem · body 1rem · ui 0.875rem · meta 0.8125rem · data 0.75rem. Nothing a person reads is under 12px (the 11px micro size is retired into data).

**Upstream follows at the token** (2026-10-15): Tailwind's sizes are the roles, in a `@theme` block in `omarchy-world.css`, so a stock page reads as the same product as Photos. `text-xs` is meta (13px, +0.005em), `sm` ui, `base` body (line-height 1.55), `lg` heading (18px, 650), `xl` a title-sized line in Mona (20px), and `2xl` to `5xl` headlines and numerals in the display face at its condensed width (24, 30, 36, 48px; 750 then 800), so album and group titles, the Years and Months tiles, places and statistics speak the bar's voice at about upstream's sizes; `6xl` is the display role. Every h1-h4 is Mona at 650 (gallery-theme.css had sent them all to the display face, at 14px a 96pt poster design); a rule that wants the display face for a heading names it. `font-mono text-xs` keeps the data size; upstream's arbitrary 9-11.5px sizes are the data size; thin, extralight and light weights read as regular. On a dark ground body text runs at 420 and the small roles get a little more tracking and leading.

- **Display** (800, condensed `wdth 75`, `--ws-text-display`, line-height 0.85; numerals -0.035em, words -0.01em with 0.06-0.08em word spacing, since at the condensed width a tight setting runs words together): the year in view in the timeline header, page headlines (AI inbox, Command center), Years banners. With the glass chrome the timeline heading folds to title size in one slim glass row once the photos scroll (the space reserved above them keeps the open height, so nothing moves).
- **Display Month** (500, same size and width): the month name beside it, first letter capitalised. Weight contrast, not size, separates month from year.
- **Headline** (750, `wdth 80`, `clamp(1.75rem, 1.2rem + 1.6vw, 2.5rem)`, line-height 1.05, balanced wrap): empty-state titles.
- **Title** (650, 20px, -0.01em, display face): a page's name in its title bar.
- **Heading** (650, 18px): section and group names, inbox row titles.
- **Body** (400, 420 on dark, 16px, line-height 1.55, max 60ch): explanatory copy, empty-state bodies, day labels in the timeline (display face, tabular).
- **UI** (500-600, 14px): buttons, tabs, sidebar items, segmented options.
- **Meta** (400, 13px, muted): details and captions. Menus run a step smaller (12.5px) on the owner's wish.
- **Data** (600, 12px, tabular, monospace): counts ("59 items"), year pills, dates, EXIF, workspace numbers.

### Named Rules
**The Scale Contrast Rule.** Hierarchy comes from the jump between display numerals and 12px data, with title/heading/body as the only steps between; no new in-between sizes.

**The Data Is Mono Rule.** A number that is information (count, year, date, EXIF) is set in the desktop's monospace. A number that is a heading (the year in view, a day label) is set in the display face.

## Layout

**The gap module.** `--ws-gap` (fallback 10px) is Hyprland's inner gap times two, the space between two tiled windows. It is the justified-layout spacing between photos (read by `VirtualScrollManager` at layout time) and derives the header rhythm: strip pills step at 0.4 gap, the header sits 0.6 gap above and 0.8 gap below, and 2.4 gap splits the month heading from the year strip.

**Rows fill the width.** Days that fit on one line are pooled into shared rows, each re-laid at one height so it ends exactly at the viewport edge (photos shrink by at most 0.72x, grow up to 1.6x). Each run of such days is cut into rows as a whole, choosing the cuts that keep every row nearest the target height, the last included (2026-10-15: greedy pooling left each month's last row wherever its days ran out; the owner: "make it so that images align on the right side"). **Months share rows** (2026-10-15, the owner's yes): a month whose last row cannot fill even at 1.6x hands it to the next month, which cuts those days in with its own first ones; the handed-on days hang below their own month's box, exactly where the next month's box begins, so the row reads as one (`internal/layout-support`: a month box paints what overflows it and lets clicks through to its day sections; a month whose photos all go on that way has no height of its own). Sparse views fill the width now (Favorites: 33 of 48 rows short before, 2 of 58 after). Only where no next month can take them (the last month, or the next not yet loaded) does a short row widen its tiles, their edges cropped, by up to 1.35x, or stay short. A day too wide for one line takes the row to itself, its photos split into balanced lines each justified to full width. Rows sit on whole pixels: the height is rounded and the widths take the hair that rounding left, so every full row ends on the same pixel (flooring the height had left most rows a few pixels short). While any day's layout is deferred, the upstream packing is the fallback.

**Shell.** One bar (`components/omarchy/OmarchyBar.svelte`, 56px, one hairline along its foot, the glass when chosen): menu and mark in a first column as wide as the sidebar; the page's own content in the middle (`lib/managers/bar-slot` `content`; Photos puts its month heading and the years there; every other page its title row: back button, title in the bar heading face, description in mono, its own buttons, fitting itself by dropping the description, then button labels, then wide-screen extras, and on a phone letting its own buttons scroll sideways; a name cut short inside its room counts as not fitting, so the dates go before the name does); then the icons: a page's own tool first (`bar-slot` `tools`; Photos: the filter panel's reopen button), search as an icon that opens into the field over the middle, undo (only while there is something to take back: the recent actions, newest first, in a sheet like the View menu's; Ctrl+Z takes back the newest either way), the View menu (order, thumbnail size, day labels, expanded stacks, compact, then the theme: Follow Omarchy (the default) / Light / Dark, then Cast), upload, notifications and the account (28px, a ring at 38% ink with the initial in ink; a picture fills it; upstream's colour discs put the initial at 2.9:1 in dark themes). No second header row on the plain timeline. Sidebar shares the ground with a hairline edge. The filter rail starts collapsed; the timeline leads. **Theme and light/dark go together:** following Omarchy, the desktop picks light or dark (prefers-color-scheme, which Omarchy flips with its theme); a chosen theme brings its own; Light or Dark in the View menu holds one face until Follow Omarchy is picked again.

**One gutter.** Every page starts on the same line, 0.5rem in from the sidebar: the bar's page part (a title, a back arrow, Photos' month heading), the photo grids (no extra inset of their own) and the text columns (Shared, Settings, the AI inbox, Utilities; no side padding of their own). The bar's own icons stand behind a full-height hairline with 0.5rem on each side, apart from the page's tools (2026-10-15; the owner saw "spacing inconsistency at the command bar").

**Responsive.** Below 768px: header stacks, day labels shorten to weekday + date, the grouping control floats at the bottom. Below 640px the bar keeps the menu button without the mark, and upload waits for a wider screen (a phone uploads through the app; Import stays in the sidebar). On coarse pointers, tiles at least 200px wide show their place caption permanently.

## Elevation & Depth

Flat on the ground; depth only for what floats above it, like a Hyprland popup. Upstream `shadow-sm/md/lg` utilities are zeroed. Tiles have no shadow; their edge is an inset hairline.

### Shadow Vocabulary
- **Popup** (`box-shadow: 0 12px 32px -8px rgb(0 0 0 / 0.28)` plus a 1px hairline border): menus, dialogs, listboxes, and the floating (mobile) grouping control.

### Named Rules
**The Floats Only Rule.** A shadow means the element floats over the ground and can be dismissed. Anything that lives on the ground is flat.

## Shapes

Corners come from the desktop: everything (tiles, menus, modals, toasts, fields, buttons, pills) uses the window radius `--ws-radius` exactly (Hyprland `decoration:rounding`; fallback 0px, square). Never add an offset to it: the owner rejected rounded controls on the square desktop (2026-10-12). A panel has one frame; separators run edge to edge. The last rules that added +4..10px were brought back to the token on 2026-10-13. Borders take the desktop's `--ws-border` (`general:border_size`, minimum 1px; fallback 2px) for focus, 1px for hairlines. Upstream's markup follows at the token: the whole Tailwind radius scale (`--radius-xs` to `--radius-4xl`) is `var(--ws-radius)` in `omarchy-world.css`, so stock cards, bars, fields and buttons square with the desktop; only `rounded-full` stays round, for faces and avatars. Photo tiles take the radius exactly at every size (the zoom-following ~6px of 2026-10-10 went on 2026-10-15). **Rounded corners** (the View menu's switch, per browser, 2026-10-16, `lib/theme/corners.svelte.ts`) is the one exception, and the owner's to choose: it puts `--ws-radius` at 8px whatever the theme (`:root[data-corners='rounded']`, set before the first paint by `app.html`), and the tiles on `--tile-radius`, which follows the zoom (~2px at the smallest size, 6px at the default, 8px for big tiles, halved in Compact) so the gaps between photos stay lines; faces stay round either way. Upstream's round controls (@immich/ui `shape="round"` icon buttons and buttons, control bars, switches, pill links) take it too; whatever holds a picture keeps its circle, so faces stay round, as do avatars, dots and spinners, which are not controls. The layer's own pills (the viewer's toolbar, stack badges, the drag count, Curator's tool pills and buttons, the compare handle) went square the same day; a brush ring, a spinner and a face stay round.

Tile focus is drawn **inset** (an inset box-shadow on a pseudo-element), because day sections use layout/paint containment and an outset border would clip at section edges.

## Motion

Things move the way the owner's desktop moves them. The theme hook reads Hyprland's animations (`hyprctl animations`) into motion tokens beside the geometry, so a window's animation on the desktop is a photo's animation here, and turning an animation off there turns it off here (0ms). `omarchy-world.css` carries the owner's values as fallbacks; `lib/utils/desktop-motion.ts` reads the same tokens for motion written in script.

- **Arriving: no motion, speed instead.** Photos, albums, folders and months are simply there when they come into view or a page opens. Two tries at an arrival animation were dropped on 2026-10-15: a window-style pop from the tile's first pixel played out unseen at the screen's edge, and one held until a fifth of the tile was in left blank strips and popped while the tile moved (the owner: "still animates a bit weird", then "or should we skip those animation and focus on speed"). Speed is the arrival now: the timeline makes tiles, and fetches their thumbnails, about a screen above and two below the view (`lib/utils/tunables.ts`, 1300px / 2600px; upstream 500px each), and Page Up / Page Down jump at once (`lib/utils/page-keys.ts`), so presses in a row, or the key held down, page as fast as they come onto photos already loaded.
- **Close** (`--ws-close-*` from windowsOut; popin 92%, 350ms): a photo that leaves (trash, archive, To do, Villa, QR) shrinks to the popin scale as it fades.
- **Re-tile** (`--ws-move-*` from windowsMove; 400ms on the snap curve `cubic-bezier(0.16, 1, 0.3, 1)`): the photos left behind glide into their new places, as windows do when one closes.
- **Workspace** (`--ws-workspace-*` from workspaces; slidefade 20%, 500ms snap): switching years (see Time Strip).
- **Favourite:** a heart given while the photo is on screen pops in from 40% on the open curve (0.65 of the open time); a heart already there when the tile is made just sits there.
- **Never in the way:** the timeline's own suspension (scrolling, zoom, relayout) stops close and re-tile, so nothing moves while the view does.
- **Reduced motion:** a leaving photo only fades (150ms at most) and the rest re-tile at once; years cut.

## Components

### Photo Tile (signature)
Every photo is a window.
- **Shape:** window radius (`--ws-radius`) on the container, image and focus layer.
- **Rest:** inset 1px hairline.
- **Focus / Hover:** inset `--ws-border` in the theme accent (hover counts as focus, like focus-follows-mouse); default outline suppressed. 140ms `cubic-bezier(0.22, 1, 0.36, 1)`; reduced motion: no transition.
- **Place caption:** city and country on a bottom black scrim, white 12px 600, fades in with focus (140ms); indented past the favourite star. Permanent on coarse pointers for tiles 200px and wider.
- **Open and close:** like a window on the desktop (see Motion).

### Time Strip (signature)
One calm line in the middle of the one bar that never rearranges itself (`TimelineWorkspaces.svelte`):
- **Heading:** the month in view in the bar heading role (`--ws-text-bar` 20px, the title size: a label, not a headline over the photos), display face condensed, month 500 / year 750; the month opens the Months overview, the year the Years overview. It keeps the width of its longest month name (all twelve laid invisibly in its cell), so nothing beside it moves as the months change.
- **Years:** after a full-height hairline, every year of the archive (1977 to today) as mono 12px numerals on a strip that scrolls sideways under the wheel, a mouse drag, the chevrons over its faded ends (shown only where there is more), and the keys; the year in view inverted (ink fill, surface text) like the Omarchy bar's active workspace and brought to the middle as the photos scroll (unless the pointer is on the strip or it was moved in the last 2 s); each decade's first year a shade darker so the strip reads in tens. The strip is a toolbar: one tab stop, arrows/Home/End move along it.
- **No month row:** the months are the scrubber's and the Months overview's; a row of twelve in the bar took the room the years need in a narrower window (the owner's call).
- **Narrower bars** keep the same line: a short month name at 380px, and below 190px (a phone) the heading alone. Nothing folds and nothing opens over the photos.

### Year Workspace Strip (superseded by the Time Ruler)
The archive's years as workspace numbers, newest first.
- **Pill:** monospace 12px 600, muted, transparent; hover tints ink 7% and raises to ink; active (the year under the viewport) inverts to ink fill and surface text; focus outline `--ws-border` accent, 2px offset.
- **Behaviour:** horizontally scrolling, scrollbar hidden, 1rem edge masks, chevrons at both ends page it; the active pill scrolls to centre. Below it, the months of the year in view as 1-12 (10px mono; empty months faded, the one in view underlined in the accent); the heading's month name opens the Months overview, the year the Years overview, so the Years/Months/All row is only drawn in those overviews and with active filters. Filter and search sit with the header tools. `[` and `]` step to the older/newer year (ignored in inputs and while the viewer is open).
- **Workspace slide:** switching years moves the timeline layer the way the desktop switches workspaces (`--ws-workspace-*`; the owner's slidefade 20% over 500ms on the snap curve): the year in view slides the shift and fades in the first 40% of the time (ease-in `cubic-bezier(0.55, 0, 1, 0.45)`), the timeline jumps, and the new year comes in from the other side in the rest on the desktop's curve; older years arrive from the right. A plain slide on the desktop slides the full width without the fade. The month heading flies 40px in the direction of travel (260ms cubic-out). Reduced motion, or the desktop's workspace animation off, cuts straight to the year.

### Segmented Control (Years / Months / All)
- **Shell:** transparent, 1px hairline, the window radius, 3px inner padding; floating variant takes the surface and the popup shadow.
- **Options:** muted text, the window radius; pressed option inverts (ink fill, surface text).

### Sidebar Navigation
Compact icons on the shared ground. Items weight 500, the window radius; the active item inverts like the Omarchy bar's active workspace, icon inheriting the surface colour. The storage line at its foot sits on the ground under an edge-to-edge hairline (`.ws-storage`), not on a tinted card; its meter fills in ink.

The albums are laid out as on the Mac (2026-10-14, the owner chose "plan A"): **Albums** is your own albums as one tree, and **Shared**, right below it, is everything shared, in place of the separate Spaces, Sharing and Shared links rows. Shared opens the Shared page and holds the Spaces (Library excepted, see Album folders), each opening into its own tree, then a Shared links row; it is lit on its own page and the list of Spaces, never beside one of its rows.

**Family accounts** (2026-10-16, the owner: "Owner tools only for me"): the owner's tools show for the owner only, the server's admin. A family account's sidebar has no Command center, AI inbox, Chat, Utilities or Import, and no server status at its foot (BottomInfo keeps its storage); the same pages leave Ctrl+K (`adminOnly`, including the inbox's tabs and Duplicates) and the command list, and their loaders send a family account to Photos (`authenticate(url, { admin: true })`: `/command`, `/inbox`, `/chat`, `/ask`, `/utilities` and its tools, `/import`, `/workflows`). Curator acts for its owner only (it answers anyone else with 403), so its tools elsewhere follow the same rule.

### Album Tree (sidebar)
Folders and albums as a tree under Albums and under each Space (`components/sidebar/album-tree.svelte`), like the Mac's sidebar. Each level lists its folders, then its albums, by name the way a person numbers them. A folder has a chevron (open and closed on click, remembered per tree) and a folder icon (open while open); its name opens its page. An album has the album icon and, when shared with people or by a link, a small share mark at the row's end. Rows are 2rem, ui size, weight 500, one rem further in per level, on the sidebar's pill inset; pointing tints them ink 6%; the folder or album on screen inverts (ink fill, surface text) and the folders above it open by themselves when it arrives (a folder closed by hand afterwards stays closed). The rail shows no tree.

### Carrying photos to the sidebar
Photos go where the Mac sends them, onto the sidebar (2026-10-16, step 2 "albums Mac-style": "I want what Mac photos has… easy album management"). On every photo grid (the timeline, an album, search, a folder) a press held on a photo lifts it, with the selection when it is part of one (`actions/marquee-select`; pressing and moving at once still draws the box, releasing in place still selects); over the sidebar it goes into the row under it (`managers/sidebar-drop`, `services/sidebar-drop`): an album (the Albums tree, a Space's tree, Pinned), To do, Villa or QR (their move, as their key does, never the way out), a Space, or **New album**, a zone at the foot of the sidebar's view only while photos are carried (a dashed hairline like Import's drop zone, ui type), which makes an album of them as N does (Album keys (L and N): named by where and when they were taken, its toast with Open and Undo, the last album for L), and lights its new row in the tree for a moment. The row that would take them lights as the photo they would stack on does: the `--ws-border` accent inset and a 14% accent tint, the response to the pointer, while the inverted row stays what is on screen; nothing else in the sidebar answers the pointer meanwhile, so a folder, Shared links, the album or Space they come from and anything I cannot add to stay dark. Under the carried photo a small popup (the ground, a hairline, the popup shadow, meta 600) says what a drop would do: "Add to Bali", "Move to To do", "New album" with the name in muted meta, "Stack" over a photo on the timeline; near the window's foot it hangs above the pointer. A folder row (an album folder, a Space, Albums, Shared) springs open after 700ms under the photos, as Finder's spring-loaded folders do; what a drag opened closes when it leaves the sidebar (after 400ms off it) or ends without a drop there, and a drop keeps the folders on the way open. Near the sidebar's top or bottom edge the photos scroll it; Escape puts them back. A sidebar that is not on screen (a phone, the drawer, put away) offers nothing: there a hold on a grid without stacking only selects, and touch keeps Immich's long-press. Reduced motion: the zone appears without its rise, and the new album's light holds without fading.

### Pinned albums
"Pin to sidebar" and "Unpin from sidebar" (2026-10-16) sit in an album's right-click and ⋮ menus (its card, its list row, its page) and in the right-click of its row in the Albums tree and under Pinned; never for To do, Villa or QR, which have rows of their own. Pins are per browser, in the order pinned (`stores/pinned-albums`); an album that is gone or no longer shared simply leaves. **Pinned** is a group of its own, headed like Library, right above it, after the views: where the Mac puts Pinned, first after the library's own views, above the special albums' rows so a long Albums tree never pushes it out of sight, and outside the tree so a pin reads as a shortcut, not a second place in the hierarchy. A row is a sidebar row (3rem, ui 500) with the album's cover (22px, the window radius) where the others have an icon, so pins tell apart in the rail too. The album on screen inverts its pinned row, and its row in the Albums tree (and Albums itself) then stays dark, so one row reads as on screen. Pinned rows take carried photos like every album row.

### Tags and Folders (the Explorer)
Tags and Folders keep upstream's sidebar of their own, the Explorer (836 tags under the main sidebar's Tags row would bury everything below it), but draw it like the albums' tree (`components/sidebar/explorer-tree.svelte`, 2026-10-15). The page itself is the first row, a sidebar row like Albums (Tags, Folders), inverted at the top level, its chevron folding the tree; under it the tree in the Album Tree's measures: rows 2rem at ui size 500 in Mona (upstream set the names in mono), one rem further in per level, a chevron where a row holds more, outline icons (a folder opens while open; a tag keeps a colour given to it), sorted the way a person numbers them; the row on screen inverts, and it and the rows above it open when it arrives (a tag's page shows its photos, so only the tree shows the tags inside it) and it is brought into the sidebar's view.
- **Content:** a calm list on the gutter (`components/omarchy/ExplorerList.svelte`), where upstream drew a grid of 64px icons on a grey slab: a row per tag or folder, its icon muted, its name in the ui role, what it holds in data type at the row's end ("3 tags", "12 folders"), a hairline under each row (pointing tints it ink 4%, as Settings' rows), set in columns of at least 17rem as the window allows, in reading order. A folder's own photos follow the list, their grouping control on the gutter; a tag with photos shows its timeline as before.
- **Bar:** the level on screen is the page's title (Tags or Folders at the top, with the count in data type: "836 tags", "355 folders"), an arrow up a level leads it as the album page's back arrow does, and below the first levels the full path follows in data type ("Auto/Receipts", "/mnt/archive/iCloud/2014/03").
- **Structural departure:** these pages no longer use upstream's breadcrumb slab (`tree/TreeBreadcrumbs`), icon grid (`tree/TreeItemThumbnails`) or mono tree (`tree/TreeItems`, `tree/Tree`); the bar's up arrow, the tree and the list carry the navigation.

### Buttons and Links (empty states)
- **Primary action:** ink fill, surface text, 600 at 0.9rem, `0.55rem 1rem`, the window radius; hover mixes 15% accent into the ink.
- **Text link:** ink, 500 at 0.9rem, underline in hairline at 0.25em offset; the underline takes the accent on hover.
- **Focus:** `--ws-border` solid accent outline, 3px offset.

### Empty State
A sentence of why and one next step: headline title, body copy in muted ink (max 34rem column, top margin `clamp(3rem, 12vh, 8rem)`), then one primary action and at most one text link.

Every empty state stands on the page's gutter, left-aligned under the bar's title, as the one gutter asks (the Space pages first, 2026-10-15; every page since 2026-10-16). Upstream's `EmptyPlaceholder`, a grey slab with a cartoon that was itself the button, is gone from the user pages: `EmptyState` (`lib/components/omarchy`) draws the same grammar from a title, a body, one action and one link (Photos filtered: No matching photos and Clear filters; Photos and Recently added empty: Upload; Albums: Create album; Spaces: Create shared space; Shared: Share an album with Family; Favorites, Archive, Locked Folder, Trash and Explore say why, with no button). The admin pages keep upstream's.

### Sign-in pages
Login, register, change password, the PIN prompt and maintenance (`AuthPageLayout`) keep upstream's blurred logo behind one centred card, and the card is a window as a modal's panel is: the theme's surface in one hairline frame with the modal's shadow, its fields the modals' (a faint fill, a hairline, the accent when focused; `.ws-auth-card`, 2026-10-16). Before, it was a fixed grey of its own with grey slab fields and an ink focus ring.

### Inputs / Fields (person name)
Transparent with no border at rest, ink 600, the window radius. The placeholder appears on the card under the pointer or on focus (140ms). Focus: ink tint 6% and `--ws-border` accent outline.

**List search** (Albums, People, Places: `lib/elements/SearchBar.svelte`, `.ws-search-field`): the ground with a 1px hairline inside the window radius, ink text, the placeholder in muted ink; focus draws the `--ws-border` accent inside the field. Upstream's grey slab put the placeholder at 3.3:1 in dark themes.

### Settings Section (SettingAccordion)
Settings and Administration › Settings are a column of rows on the page's own gutter (`.ws-page-column`, 60rem at most, left-aligned like the AI inbox; upstream centred a box), never cards.
- **Row:** icon 20px muted (ink while open or pointed at), title in the heading role (17px, 600, ink), the description under it in meta (13px, muted), a muted chevron; a hairline below every row; pointing tints the row ink 4%; focus is an inset `--ws-border` accent outline.
- **Open:** the row stays and its controls follow, indented under the title, the next hairline closing them. A section inside a section (Features › Albums) is the same row at UI size.
- **Controls:** labels ink, descriptions muted (upstream paints labels in the accent); fields, buttons and switches take the window radius; a switch is an outlined track with a muted thumb when off and inverted (ink track, surface thumb) when on; a section's own action is ink.

### Shared (the feed) and Shared links
**Shared** (`/sharing`, titled Shared) is a feed (2026-10-16; the owner chose "Shared as a feed" over sections and a New strip: "newest first: who added what to which album or Space, comments and hearts inline, each with a strip of its photos"). Albums and Spaces stay in the sidebar. `components/omarchy/SharedFeed.svelte` draws it, `managers/shared-feed` reads it, `utils/shared-feed` merges it.
- **Days:** a muted meta label over a hairline, as on a Space's Activity, staying at the top while its items pass: Today, Yesterday, the weekday within the week, then the date, in the reader's language.
- **An item** is a row split from the next by a hairline, 60rem at most: who (the person as a quiet ring with the initial in ink, as the bar's account), then "Place · what" in body type, the Space or album in 600 and a link ("Family · Mom added 12 photos", "Bali · You made a link"; what I did reads You), and when in data type at the row's end ("2h ago", never "yesterday" under a day's label; the full date in its tooltip). Under it, the photos as a strip of the grid's own square tiles (`data-thumbnail-focus-container`: the hairline inside, the accent for focus and hover; 6.5rem at most), six on a wide screen and four on a phone, then +N in data type in a hairline square, a link to where the rest are. A tile opens its photo in the viewer over the feed (`/sharing/photos/:id`), stepping through that item's photos, and closing it leaves the feed as it was.
- **What it says:** one person's photos added to a Space within two hours of each other on one day are one item; photos taken out, an album taken out and someone leaving read in muted ink; an album put in a Space is named under the line beside the album icon, a link to it in the Space; a day's comments on an album are one item ("Mom commented", "3 comments"), each comment's words in the language's quotes beside its photo as a small tile, the name first when several people wrote, the latest three and then "N more comments"; a day's hearts on an album are one ("3 hearts on 2 photos"), who under it in muted meta ("Mom and Dad"); a link I made shows the album's cover (or the photos it holds) and when it expires, in data type. Faces, people, covers, roles and renames are a Space's own housekeeping and stay on its Activity page.
- **Where it comes from** (the existing endpoints, all asked at once, each with a cap): the activity of every Space but Library (its rows are the album folders' bookkeeping), 30 rows a request, the 12 most active Spaces; the comments and hearts of the 24 most recently changed shared albums (shared with people or by a link); the photos uploaded since this browser last looked, in the shared albums whose newest photo change is after that (8 albums; a per-browser mark, `gallery.sharedVisit`: the first look counts the last week, opening the page again within 30 minutes keeps what was new, and a sitting ends after 12 hours); the links I made (40). One person's new photos in an album make an item per sitting, as a Space's adds do. A source that fails leaves the others: a muted line says part of the feed could not load, with Retry. Twenty items show and Show more adds twenty; a Space's next page is read only when the feed reaches it, and nothing older than what was read of a Space with more to read shows before then.
- **Quiet ways** to what the old sections held and the sidebar does not, as quiet buttons in the bar (its ⋮ on a phone): Shared albums (the Albums page's Shared filter: every album shared by me or with me; only while there is one), Spaces (every Space, past the sidebar's three, and Create Space), and each partner's photos.
- **Empty:** with nothing shared at all, "Nothing shared yet", one sentence on what gathers here, and **Share an album with Family**, which opens that Space's albums, where Link an album waits: the owner shares with Family by default, and a family archive shares albums it already has. The Space is the sidebar's first (pinned, then the most active); without one, Create Space. With things shared and nothing happening yet: "Nothing new yet", the why alone.
- **Structural departure:** the route is `sharing/[[photos=photos]]/[[assetId=id]]` (the viewer over the feed), and the page reads its sources itself rather than in its load, so opening a photo and closing it reads nothing twice; the sections (Shared albums, Spaces, Partners) are gone.

A shared link is a row with a hairline below, title in ink; with none, the page says where links come from and points to Albums.

**The Share sheet** (`modals/AlbumShareModal.svelte`; reordered 2026-10-16 for the owner's "Family default target, QR invite"): an album's Share (its app bar, its ⋮, its card's menu and the Shared with row) opens one sheet instead of upstream's Options box (which keeps the album's settings), in the order the family shares. Its sections lie on the dialog's ground split by hairlines that run edge to edge (`.ws-sheet`): a head (the name in ink at body size, 650; its action at the end as a quiet outlined button) over what it holds, or over one muted line while it holds nothing.
- **Spaces first.** The Space that leads is a switch, "Show in Family", with one muted line on who sees it: its other members by name ("Anna and Ben see it too"; past four, three named and the rest counted), or "Only you so far. Family members see it once they have accounts." No Space is known by its name (`utils/share-space`): the lead is a Space the album already shows in, else the Space the last share went to in this browser (a switch turned on, photos added), else the oldest Space offered, the family's own as a rule; it holds while the sheet is open. The other Spaces follow as quiet rows (ui size, muted, the same switch). Only Spaces I can add to are offered, never Library; with none, one line points to Shared. The album stays in its own folder either way. The switches are Settings' (outlined when off, inverted when on).
- **Then Link.** "Make a link" makes one in a press, with a new link's defaults (downloads on, the place left out) and open for 30 days (the owner, 2026-10-16: "30 days", as iCloud's links, so a forwarded link doesn't live forever; `shareLinkExpiry`), and the link shows in place (`components/omarchy/ShareLinkPanel.svelte`): its QR, 160px of black on a white quiet zone, drawn as SVG so it stays sharp at every density, holding the public address the rest of the app gives out (`asUrl`: the external domain, so it opens away from home; while none is set, a muted line says the link opens only on the home network); beside it the address in data type (two lines at most, the domain whole), what the link allows in a muted line (the Shared links page's words: its expiry as a date, or "Never expires", then Download, Upload, Password, Location; an expiring link ends the line with "Remove expiry", a quiet underlined word that keeps it open, or opens an expired one again), then Copy link in ink and Edit link and Delete link quiet, one under the other. On a phone the address goes under the code. Edit link opens the link's options in a dialog over the sheet (`modals/SharedLinkEditModal.svelte`: the Shared links page's fields and save, with the house switches), so changing a link never leaves the album. Older links of the album follow as rows. With none, the line says a link opens for anyone who has it, without an account.
- **Then People** (their own Gallery accounts): who has it (Editor can add photos, Viewer can look, or remove) and Add user; with nobody yet, one muted line says people need their own Gallery account.

**Sharing photos** (`modals/SelectionShareModal.svelte`, 2026-10-16): Share on a selection (every selection bar, the photos' right-click menu, Ctrl+K, Show selected's foot) and on a photo in the viewer opens the same sheet for the photos, titled by their count ("Share 12 photos"). First "Add to Family" in ink, with who sees them, through the Add to album or space picker's own dispatch (`addAssetsToCollections`: its toast and View Space), then "Added to Family" with a check in its place; other Spaces follow as quiet buttons. Then Link, as above, for the photos the link covers. Only my own photos go into a Space (as a drop on the sidebar) or into a link (#853): the sheet says how many stay out, and with nothing of mine selected a toast says so instead. On a Space page that scopes the link to itself (#1018, the bar's `shareSpaceId`) the link takes the whole selection, and before it is made an ink line marked by the warning colour's icon says that other members' photos become public; that Space is not offered to add to ("These photos are in Family."). Structural departure: neither a selection's Share nor the viewer's opens upstream's `SharedLinkCreateModal` any more (the album Options box still does), and `handleCreateSharedLink` makes its link through `makeSharedLink`, which hands the link back without the QR dialog.

### Special albums (To do, Villa, QR)
Albums that keep photos out of Photos: To do (photos set aside to deal with later), Villa, and QR (bank slips and payment QR codes). Moving a photo into one puts it in the album, tags it with the album's name and archives it, so it leaves Photos; taking it out (Mark done in To do, Remove from Villa) puts it back where it came from, and not while the other one still holds it. Each has a sidebar row under Favorites with the count at the row's end in data type (`.ws-nav-count`, muted; it inverts with the active row), and its album page lights that row, not Albums. Its move action sits beside Favorite in the selection bar and in the right-click menu; its way out is the album's primary (ink) selection action; its key (B To do, V Villa, Q QR) does whichever applies, to the selection or, with nothing selected, to the photo under the pointer. Under the album's title one muted line says how it works (`.ws-album-note`). Before anything goes there, `/todo`, `/villa` and `/qr` are empty states that name the key and the right-click item.

### Album keys (L and N)
Two keys file a selection, as the Mac's Add to and New Album with Selection do (2026-10-16). **L** opens Add to album or space on the album photos went into last in this browser (`utils/last-album`: the picker, a drop, an album's own Add; never an upload, To do, Villa or QR): it leads the Recent rows with the caret on it, so L then Enter adds to it again, and an Enter pressed while the albums are still loading waits for them; with no last album, or one that is gone, the picker is as it was. **N** makes a new album of the selection (`utils/album-from-selection`), named by where and when the photos were taken (`utils/album-naming`: "Phuket · Mar 12 – 15, 2023", the dates alone without a place), and that album becomes the last one, so the next photos follow it with L, Enter. The selection clears (its work is done, and a second N cannot make a twin); the toast names the album and its count with Open and Undo (`components/omarchy/UndoToast.svelte`; the undo, in the bar's history and on Ctrl+Z too, deletes the album, never its photos). The server keeps out what is not the person's to add (another member's photos, seen through a Space): the toast says how many went in, no empty album is left behind, and N is not offered where the picker is narrowed to a Space's albums. Both keys are in the shortcuts list (Shift+?); N is "New album from selection" in Ctrl+K and in the photos' right-click menu, which shows L, N, T and ⇧L at their rows' ends as it shows B, V, Q, ⇧D, ⇧A and Del (`ActionMenuItem`'s `hint`).

### Show selected
The selection bar's count is a button, a muted chevron after it (2026-10-16): it opens the selected photos alone in a sheet (`modals/SelectionReviewModal.svelte`) titled by the live count, to look them over before acting on them. The photos are the grid's own tiles, square on the desktop's gap (about six to a row on a wide screen, three on a phone): the hairline inside, the accent for focus and hover, a selected photo's ink frame and ink check on a surface disc. A click takes a photo out of the selection (its check turns to an empty ring and it fades to grey at 35%, as Bank slips' left-out slips do) and a second click puts it back; the page's own selection follows each click at once, its tiles and its count. The foot says how it works in a muted line, or how many are left out in data type with "Put them back"; then the selection's main actions on that page (`AssetSelectControlBar`'s `reviewActions`: Share, New album from selection, Add to album or space, gated as the page's own bar; none in the Trash, the Locked folder and on shared links) as quiet outlined buttons, icons alone on a phone, and Done in ink. An action closes the sheet and runs on what is still selected, and its key (L, N) works inside the sheet too; Escape, Done or a click beside the sheet close it, and the focus returns to the count. The grid is a multi-select listbox: the arrows, Home, End and the page keys move the caret, Space or Enter take a photo out or back, and Delete only ever leaves one out. Only the rows in view, and two on either side, are drawn (`utils/review-grid`), so a selection of thousands opens at once.

### Albums kept out of Photos
An album hidden from my timeline carries one mark wherever it shows ("have a better visual indicator for albums that are excluded from photos"): on its card the cover turns grey (`.ws-album-cover-hidden`) under a strong-glass "Not in Photos" chip at the top-left (`.ws-hidden-chip`, eye-off icon, micro type), clear of the menu at the top-right; in the list view the same words in muted ink after the name (`.ws-hidden-mark`); in the sidebar tree an eye-off at the row's end, before the share mark; on the album's page a muted line under the title with the way back, "Show in Photos" (`.ws-album-hidden-note`).

### Utilities
Two headed lists on the gutter, Organize your library and Download, each name in the heading role over a hairline as Shared heads its sections, and each tool a row as Settings and the explorer lists draw one: a muted icon that turns ink under the pointer, the label, a hairline below (2026-10-16; two rounded cards with accent icons before).

### Bank slips (Utilities)
`/utilities/slips` works on the slips Curator finds (bank tags, slip or PromptPay wording in Gallery's OCR, whatever QR holds), laid out like Shared: sections headed by their name with the count in data type. "QR" says how many are filed and holds the switch for filing new slips and QR codes as they arrive (an @immich/ui Switch in a Field, its hint a muted line under it). "Amounts" holds the rule: two segmented controls (`.ws-seg`, at the row's start here) for what to do (Move to QR, Move to Trash) and which amounts (Any amount, Under, At least, Between; Under is below its amount and At least includes it, so the two meet with no slip left between), then the amount fields (number fields in data type, ฿ after each; each range keeps its own numbers, remembered per browser, applied once typing pauses or on Enter). The action is never remembered: the page always opens on Move to QR. The heading carries when the list was loaded and a Refresh; a muted line says how many slips the rule leaves out. Below, a grid of the slips the rule takes, each a portrait tile with its amount on a strong-glass strip along the bottom; resting on one shows it large at the right. A rule on amounts takes only slips whose two readings (Gallery's text, the vision model) agree: a click leaves one out (it greys out, an accent "Left out" chip at its corner). Slips read once or two ways sit under "Check these", both readings on the strip, and only go when clicked in. A line in data type says what is in QR already, or that codes without an amount never go to the Trash. One button applies the rule: ink for QR, danger red for the Trash, which asks first; both leave an Undo in the toast and the bar.

### Tool pages (Duplicates, Manage location, Large files, Workflows, Import)
Utilities' other tools, Workflows and Import looked like stock upstream until 2026-10-15: a centred compare card with red and green pills, a green or red chip on every tile under a crowded bar, red badges with names and sizes under the tiles, a centred card per workflow, a centred stepper over two big cards. They now speak Bank slips' grammar: on the gutter, split by hairlines, chips on photos in strong glass with white text, the active thing inverted, data in the mono, and the danger role only on an action that trashes. Structural departures: Duplicates' count moved from its title to the bar's data; Manage location's instruction left the bar and its coordinates became the map button; a workflow's menu left its link; Import's source cards became a segmented control.
- **Duplicates** (`utilities/duplicates` with `DuplicatesCompareControl`, `DuplicateAsset`, `InfoRow`): the bar shows the number of groups in data type after the title. Under it, how the page works in a muted line, and the payment slips left out with Show them. A group is as wide as its photos (at most the page): first a row of tools over a hairline (Select keep all and Select trash all, quiet; Stack, framed by a hairline; then the action, ink for Keep all, the danger role once it trashes), then the photos side by side, each a column of up to 32rem (24rem for a portrait group; every tile takes the first photo's shape, so the rows line up across), scrolling sideways on a phone. A photo is a tile: a hairline inset, the accent while pointed at, and the selected photo's ink frame on one to keep; its Keep or Trash chip, External, the stack count and the view button are strong glass. Its details follow in rows split by hairlines, the label in muted meta, the value in data type at the row's end; then Show more fields, and under a hairline the way through the groups (First, Previous, the place in data type, Next, Last; arrows only on a phone). With no groups, an empty state that says where groups come from and offers Utilities (or the slips left out, with Show them). The keys (A, S, D, Shift+C, Shift+S, the arrows) are unchanged.
- **Manage location** (`utilities/geolocation`): the bar holds what the page does. The location to give is a field in data type that opens the map (Choose on map until one is picked; it inverts for a moment when a click on a photo picks one); Unselect all shows only while photos are selected; Apply, ink, waits for photos and a place (upstream let it run with no place, to no effect). How the page works is a muted line above the photos. A photo without a place carries a strong-glass "No GPS" chip; one with a place shows it in the place caption while pointed at, as on Photos, so the photos stay the brightest thing on the page.
- **Large files** (`utilities/large-files` with `LargeAssetData`): square photo tiles on the desktop's gap from the gutter, biggest first. The size sits on the photo in data type on a strong-glass chip; "External" (a file in an external library: deleting it here leaves the file on disk) joins it while the tile is pointed at, and always on touch screens, since a library kept outside would mark every tile; the file name is the tooltip (upstream: the asset's JSON).
- **Workflows** (`/workflows`): rows on the page column under one muted line on what workflows do. A row is its name in the heading role, its description in muted meta and its trigger in data type; while it is off, "Disabled" in data type follows the name, which steps back to muted ink. The menu sits at the row's end, outside the row's link. With none, an empty state with Create first workflow and Browse templates.
- **Import** (`components/import`): the wizard is a 48rem column on the gutter. The steps are one line over a hairline, each its number in data type and its name: the step in hand inverted, the ones done in ink with a check, the ones to come muted (a phone names only the one in hand). The source is a segmented control: Google Photos chosen, Apple Photos waiting with Coming soon; what Google needs is a muted line with its link (upstream: a blue panel). The files go into a dashed-hairline drop zone and list as rows with their sizes in data type; scanning and importing run on the desktop's 2px meter; counts are a line of labels and numbers in data type (an import's errors take the danger role on their number, and only when there are some); the review's albums and options are sections headed like Shared's, their rows split by hairlines, the switches as in Settings. Back is quiet and the step's next action ink; a finished import is an empty state's headline with View Photos and View Albums. Two of the wizard's unit tests check the step in hand (`aria-current`) and the chosen source (`aria-pressed`) where they checked upstream's primary classes.

### Curator's tools (its owner's only)
Curator works for one account, the owner of its API key, who is this server's admin, and refuses every other (2026-10-16, the owner: "Owner tools only for me"). So everything of Curator's outside the owner's own pages asks one gate first (`curatorIsMine` in `utils/curator`: the admin flag, known without asking Curator). For a family member's account the viewer's Adjust, Remove objects, Live effects, Look Up, Copy subject and Save frame (and its line in the shortcuts sheet), the videos for chat apps, Pick the best, Make photo book and its Ctrl+K command, Save as smart album and a smart album's badge, the stories under an album and over a memory, the corner panels and Ctrl+K's Ask mode are simply not there, and nothing asks Curator anything. A tool's `available` holds the gate and its `check` asks for the owner alone, so what Curator told the owner's session is not offered to the next account signed in in the same tab, and a job the owner started (a book, a video, a saved frame) is not asked about while that account is signed in.

### Photo books
**Make photo book** (Curator's `book.make`, a print-ready square book of 21 cm) sits in an album's ⋮ and right-click menus after Download (never for To do, Villa or QR, and only once Curator says it makes books); a year's book is the Ctrl+K command "Make a photo book of a year", so the year strip stays navigation only. One dialog asks for the title (the album's name without Curator's " · dates", or the year, which it follows until typed over), about how many photos (an album starts from its own count up to 120, a year from 150) and, for a year, which year (a Select of the years with their counts, the last full year first; its popup takes the theme's corner like every other), with one muted line on what Curator makes and where it keeps it. While Curator works, a square panel in the bottom-left corner, in the frame of the videos for sharing and stacked above them, says how far the book has got (waiting, choosing photos, page n of m, cover and preview) over a 2px line along the row's foot; then its page count and its three PDFs (Book for the print lab, Cover, Preview of the spreads), each with its size in data type and an open-in-a-new-tab and a download icon. The panel lives as long as the page, so a book is still followed while the user goes elsewhere.

### Album page (in the shell)
An album opens inside the shell like every page (2026-10-15; upstream gave it its own full-width slab bar and no sidebar): the sidebar stays, the album lit in its tree, and the one bar carries a back arrow (to the album's folder), its name in the bar's heading face (`components/omarchy/AlbumBarTitle.svelte`: an editor renames it in place, a click making it a field), its dates and count in data type, and its own buttons, **Share** labelled first, then Cast, Add photos, Map, Slideshow, Download and the ⋮. Below 768px the tools fold into the ⋮ and only Share and the ⋮ stay. Under the bar, a block of details scrolls away with the photos (`.ws-album-details`): how a smart, special or hidden album works, its description (66ch at most), Curator's story, a **Shared with** row (the people and a link, one row that opens the Share sheet) and the album's people as small faces (`AlbumPeopleStrip.svelte`, the filter rail's own named people) that narrow the album to a person and back. No cover over the page. Selecting, adding photos and choosing a cover swap the bar for theirs, as Photos' selection does. Structural departure: the album route renders `UserPageLayout` and its selection, add-photos and cover bars after it.

### Person page (in the shell)
A person opens inside the shell like an album (2026-10-15; upstream gave it its own slab bar, no sidebar, a large face and "20 assets"): the sidebar stays, and the one bar carries a back arrow up to People, the person's face and name in the bar's heading face (`components/omarchy/PersonBarTitle.svelte`: someone who may edit the person renames them in place, a click making the name a field; the people whose names match drop down under it like a context menu, and picking one offers the merge, as the old name field did; Enter or leaving the field saves, Escape keeps the name; someone unnamed reads "Add a name" in muted ink), then in data type how many photos (never "assets"), the faces where the server counts them and the birthday when it is known, and its own buttons: **Merge people** labelled, the heart (not for a Space's people, who have no favourite) and the ⋮ (representative face, date of birth, hide, separate from a grouped person). Below 768px the heart folds into the ⋮, and below 640px the face gives the name its room. The Years / Months / All row stays above the photos on the gutter; under it a block of details scrolls away with them (`.ws-person-details`): the faces found that could be this person as one calm row (their face and the question, the count in data type, the candidates as small round faces, Review in ink, Not now as a quiet word), styled through the shared banner's own hooks, and nothing at all when there is nothing to say. No face over the page. The back arrow, Escape and hiding the person go up to People (upstream went back to wherever the page was opened from). Selecting swaps the bar for its own; merging and fixing a match open over the page as before. Structural departure: the person route renders `UserPageLayout` and its selection bar, merge and fix-match views after it; upstream's `EditNameInput` stays in the route, unused.

### Search page (in the shell)
Search opens inside the shell too (2026-10-15; upstream gave it a bar of its own and no sidebar, where this layer had only a notice pointing to Ctrl+K). The one bar carries a back arrow and the query as a field (`components/omarchy/SearchBarQuery.svelte`): the list search's frame (`.ws-search-field`) at body size, as tall as the page buttons and at most 38rem wide, with the palette's mode control at its end behind a full-height hairline (`global-search/search-mode-control.svelte`, its four modes that search by a text; Ask stays the palette's), then the count in data type. Enter searches the edited text again in place, the other terms kept; Escape takes an edit back, then leaves the field; Ctrl+/ steps through the modes as in the palette, and a mode picked there searches the same text that way and becomes the palette's too. The count is exact when the search can be counted (places, descriptions, OCR: the statistics endpoint) or has loaded to its end; a smart search ranks every photo, best first (this library has no distance cut-off), so its count is what has loaded with a + ("100+ results"). The other terms are chips under the bar (`.ws-search-terms`: a hairline frame, the name in muted meta, the value in ink; a photo to find others like shows small), scrolling away with the results, and "Add all N results to…" ends the row in Photos' quiet ink tint, only while the count is exact. A bare `/search` says how to search (Empty State, Explore as its link); no results says so and, after a Filename, Description or OCR search, offers the same text as a smart search; a failed search offers Retry. Below 768px the field keeps the bar: the back arrow goes, the mode is its icon, the count and Add all move to the chips row, and the bar's own search icon gives way. Structural departure: the search route renders `UserPageLayout`, sets its own bar through `bar-slot` like Photos, and renders its selection bar after the shell; `/search?query=` also takes plain text.

### Album folders
Albums sit in folders, as they did on the Mac. Gallery keeps folders only inside a Space, so the Albums page shows the folders of the personal Space "Library": one level at a time, the level's folders first (the Space's folder cards, a collage of four covers under a folder badge, sorted by name the way a person numbers them, years in order), then its albums as before. Inside a folder a path of crumbs leads back up (Albums › Travel › Norway). A search, or the Shared filter, lists every album at once. New folder sits beside Create album; a folder's ⋮ renames, moves or deletes it (its albums move up a level); an album goes into a folder by Move to folder (right-click, the album's ⋮) or by dragging it onto a folder or a crumb. An album's back arrow returns to its folder. Create album while a folder is open makes the album in that folder. Library is the Albums page's engine, not a Space to visit: it is left out of the sidebar's Shared section, the list of Spaces, the Shared page, Ctrl+K, the "Add to album or space" and "Link to space" pickers, and an album's Linked spaces (where unlinking it would quietly take the album out of its folder). The same menus carry Gallery's "Hide this album from my timeline" (and "Show this album in my timeline" back): hiding asks first with Gallery's count of the photos that go and of those another album of the Space still shows, and an album outside Library joins it at the top on the way. A hidden album's card is dimmed, with an eye-off line "Hidden from your timeline" under its details, as on the Space's own card; the list view marks its row with the same eye-off icon. Merge into… (the same menus, under Move to folder) picks another album (never the album itself, To do, Villa or QR), asks once (saying so when a shared link or people would lose it), moves every photo across and only then deletes the album; the album's own page goes on to the merged one. Its Undo makes the album again as it was (name, description, date, cover, order, photos, folder, hidden or not) and takes back the photos the merge brought; a link or people it was shared with cannot come back.

### Space page
No cover over the page (upstream's tall hero is gone): the Space's name sits in the one bar like every page's title, and its sections sit beside it as one segmented control (`.ws-seg`, the AI inbox's tabs: transparent shell with a hairline, the one on screen inverted, a count after its label in data type), scrolling sideways before it crowds the name or the buttons. Change cover and Edit Space are in the ⋮ menu. A Space of one shows only what means something to one person (Albums, Photos, Map; People with face recognition on, Libraries once one is linked): Members and Activity wait until someone joins, and Invite People sits in the ⋮ menu. A Space of one with albums opens on its albums, Albums leading the control, its photos at `/photos`. A Space's Photos leaves archived photos out, as Photos does; its albums still hold them.

**A Space's own pages** (Members, People, Activity, Albums; `.ws-space-pane`, 2026-10-15) start on the gutter like Shared, where upstream centred a narrow column or inset its controls another rem.
- **Members:** a section headed like Shared's (the name, the count in data type, Add Member at the heading's end, a hairline under it), 60rem at most (`.ws-space-column`) like Settings. A member is a row: the avatar (a circle, as faces are), the name over the address in data type, what they added (their latest photo as a small square tile, the count and when in data type), and at the row's end the role as a muted word, or for the owner looking at someone else the role menu. Upstream's rounded box and role pills filled in the Space's colour are gone.
- **Activity:** headed Recent activity, 60rem at most. A day is a muted meta label over a hairline that stays at the top while its rows pass; every event is a row with a hairline above the next and its time in data type at the end: photos added or removed with the avatar and the first four photos as small square tiles (+N in data type), member and face events with the avatar, everything else as one quiet muted line. No cards on a second tone, no borders or dots in the Space's colour.
- **People** keeps its controls and faces on the gutter, its counts in data type; a search or a filter that finds no one says so in one muted line (`.ws-space-none`). **Albums**' toolbar starts on the gutter, its search the list search (the ground inside a hairline).
- **Empty:** the Empty State on the gutter. People: "No people found", why, Add photos (editors). Activity: "No activity yet", why, Add photos (editors) and Invite People (the owner, to Members). Albums: "No albums linked yet", what linking does, then Link an album as the action (a family Space is mostly filled from albums that exist) and Create album and New folder as text links: two links, one past the pattern, since an empty Space has no other way to make a folder. Add photos opens the Space's Photos in its add mode, as the bar's button does.

### Filter Rail
Same surface as the ground with a hairline edge; collapsed by default. Its search and reopen buttons are transparent with a hairline border and no shadow.

### Adjust panel (photo viewer)
Adjust, Filters and Straighten (Apple Photos' editing, Curator's `live.adjust`; `components/curator/AdjustPhoto.svelte`) hold the viewer like Curator's other tools: the photo on the black stage, adjusted live on the GPU with the math Curator keeps it with, and a calm side panel along the stage's right edge, 20rem of strong smoked glass behind a glass-edge hairline (below the photo on a phone). Its header names it beside a close button; then a `.ws-seg` of Adjust / Filters / Straighten, the controls, and a footer: one muted line of help (an error in its place; hidden on touch screens), Hold for original, then Reset apart from Cancel and Keep (ink). A slider is a row: the name in UI type and its value in data type (muted at zero, signed −100 to +100, degrees for Straighten) over a 2px hairline track lit in ink from its rest point (the middle, or the left end for Intensity) to a square thumb; a double-click sets it back. Light and Color are headed in meta type, a hairline between groups. Filters are square tiles of the photo's middle in each filter, three across, the name below (two lines rather than an ellipsis); the chosen one takes an ink frame and its name inverts. Straighten lays thirds, and thirds of those, over the photo, which is cut to its own shape as it turns. Keep shows a strong-glass card at the photo's foot while Curator renders, then the new version takes the photo's place, on top of its stack, with an Undo in the toast and the bar.

## Do's and Don'ts

### Do:
- **Do** read every colour from the runtime roles (`--immich-ui-light`, `--immich-ui-dark`, `--immich-ui-muted`, `--ws-accent`, `--ws-hairline`) and keep the fallbacks as fallbacks.
- **Do** space tiles and derive header rhythm from `--ws-gap`; size tile corners and focus borders from `--ws-radius` and `--ws-border`.
- **Do** show the active/selected state by inversion (ink fill, surface text).
- **Do** set counts, years-as-data, dates and EXIF in the desktop monospace at 12px.
- **Do** give every motion a reduced-motion cut (no transition, no slide).
- **Do** style upstream markup through stable hooks and `ws-` classes so the layer rebases cleanly.

### Don't:
- **Don't** hard-code a theme's hex values, or add a brand colour of the layer's own.
- **Don't** use the accent as a fill for selected modes, nav items or years; it is the focus border.
- **Don't** put chrome on a second background tone or a rounded card slab; split the one ground with a hairline.
- **Don't** shadow anything that sits on the ground (tiles, rows, headers, the sidebar).
- **Don't** draw tile focus outset; it clips inside contained day sections.
