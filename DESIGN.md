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
    fontSize: "20px"
    fontWeight: 650
    letterSpacing: "-0.01em"
    fontFeature: "'tnum'"
  body:
    fontFamily: "'Mona Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: "'ss01', 'ss02'"
  label:
    fontFamily: "'Mona Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
  data:
    fontFamily: "var(--omarchy-font-mono, 'JetBrainsMono Nerd Font'), 'GoogleSansCode', ui-monospace, monospace"
    fontSize: "12px"
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

The layer is visual only and rebaseable: it styles upstream markup through stable hooks (`data-testid`, `data-thumbnail-focus-container`, ids) and a small set of `ws-` classes added to upstream components, and adds one component of its own (the year workspace strip).

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
- **Caption Scrim / Caption Ink** (`caption-scrim`, `caption-ink`): the only fixed colours, and only on the photo itself: the bottom gradient (black 55% to transparent) and white text of the place caption. They sit on imagery, not on the theme.

### Named Rules
**The Desktop Decides Rule.** No colour literal enters the build except the on-photo caption scrim. New surfaces take roles (`--immich-ui-*`, `--ws-accent`, `--ws-hairline`), never hex values from the theme you happen to be looking at.

**The Active Border Rule.** The accent marks focus and only focus. Selection of a mode, a year or a nav item is shown by inversion (ink fill, surface text), never by accent fill.

**The Hairline Rule.** Separation is a 1px hairline or nothing. No tinted panels, no slabs, no second background tone for chrome.

## Typography

**Display Font:** Bricolage Grotesque Variable (wght + wdth + opsz axes, fallback Mona Sans)
**Body Font:** Mona Sans variable (self-hosted, wght 200 to 900, stretch 75 to 125%, `ss01` + `ss02` on)
**Label/Mono Font:** the desktop's monospace (`--omarchy-font-mono` from the font-set hook; fallback JetBrainsMono Nerd Font, then GoogleSansCode)

**Character:** Condensed, heavy grotesque numerals set the time like a poster; a neutral variable sans does the work; the desktop's own terminal font carries every number that is data.

### Hierarchy
One size per role, as tokens in `omarchy-world.css` (`--ws-text-*`); components use the token, never a literal size:
display `clamp(2.25rem, 1rem + 3vw, 4rem)` · title 20px · heading 17px · body 15px · ui 14px · meta 13px · data 12px · micro 11px.

- **Display** (800, condensed `wdth 75`, `--ws-text-display`, line-height 0.85, -0.035em): the year in view in the timeline header, page headlines (AI inbox, Command center), Years banners. With the glass chrome the timeline heading folds to title size in one slim glass row once the photos scroll (the space reserved above them keeps the open height, so nothing moves).
- **Display Month** (500, same size and width): the month name beside it, first letter capitalised. Weight contrast, not size, separates month from year.
- **Headline** (750, `wdth 80`, `clamp(1.75rem, 1.2rem + 1.6vw, 2.5rem)`, line-height 1.05, balanced wrap): empty-state titles.
- **Title** (650, 20px, -0.01em, display face): a page's name in its title bar.
- **Heading** (650, 17px): section and group names, inbox row titles.
- **Body** (400, 15px, line-height 1.55, max 60ch): explanatory copy, empty-state bodies, day labels in the timeline (display face, tabular).
- **UI** (500-600, 14px): buttons, tabs, sidebar items, segmented options.
- **Meta** (400, 13px, muted): details and captions. Menus run a step smaller (12.5px) on the owner's wish.
- **Data** (600, 12px, tabular, monospace): counts ("59 items"), year pills, dates, EXIF, workspace numbers.

### Named Rules
**The Scale Contrast Rule.** Hierarchy comes from the jump between display numerals and 12px data, with title/heading/body as the only steps between; no new in-between sizes.

**The Data Is Mono Rule.** A number that is information (count, year, date, EXIF) is set in the desktop's monospace. A number that is a heading (the year in view, a day label) is set in the display face.

## Layout

**The gap module.** `--ws-gap` (fallback 10px) is Hyprland's inner gap times two, the space between two tiled windows. It is the justified-layout spacing between photos (read by `VirtualScrollManager` at layout time) and derives the header rhythm: strip pills step at 0.4 gap, the header sits 0.6 gap above and 0.8 gap below, and 2.4 gap splits the month heading from the year strip.

**Rows fill the width.** Days that fit on one line are pooled into a shared row and re-laid at one height so the row ends exactly at the viewport edge (photos shrink by at most 0.72x, grow up to 70% of viewport height). A day too wide for one line takes the row to itself, its photos split into balanced lines each justified to full width, so no line ends on an orphan tile. Only a month's last row may stay short (growth capped at 1.6x). While any day's layout is deferred, the upstream packing is the fallback.

**Shell.** One bar (`components/omarchy/OmarchyBar.svelte`, 56px, one hairline along its foot, the glass when chosen): menu and mark in a first column as wide as the sidebar; the page's own content in the middle (`lib/managers/bar-slot` `content`; Photos puts its month heading and the years there; every other page its title row: back button, title in the bar heading face, description in mono, its own buttons, fitting itself by dropping the description, then button labels, then wide-screen extras); then the icons: a page's own tool first (`bar-slot` `tools`; Photos: the filter panel's reopen button), search as an icon that opens into the field over the middle, undo (only while there is something to take back: the recent actions, newest first, in a sheet like the View menu's; Ctrl+Z takes back the newest either way), the View menu (order, thumbnail size, day labels, expanded stacks, compact, then the theme: Follow Omarchy (the default) / Light / Dark, then Cast), upload, notifications and the account (28px). No second header row on the plain timeline. Sidebar shares the ground with a hairline edge. The filter rail starts collapsed; the timeline leads. **Theme and light/dark go together:** following Omarchy, the desktop picks light or dark (prefers-color-scheme, which Omarchy flips with its theme); a chosen theme brings its own; Light or Dark in the View menu holds one face until Follow Omarchy is picked again.

**Responsive.** Below 768px: header stacks, day labels shorten to weekday + date, the grouping control floats at the bottom. On coarse pointers, tiles at least 200px wide show their place caption permanently.

## Elevation & Depth

Flat on the ground; depth only for what floats above it, like a Hyprland popup. Upstream `shadow-sm/md/lg` utilities are zeroed. Tiles have no shadow; their edge is an inset hairline.

### Shadow Vocabulary
- **Popup** (`box-shadow: 0 12px 32px -8px rgb(0 0 0 / 0.28)` plus a 1px hairline border): menus, dialogs, listboxes, and the floating (mobile) grouping control.

### Named Rules
**The Floats Only Rule.** A shadow means the element floats over the ground and can be dismissed. Anything that lives on the ground is flat.

## Shapes

Corners come from the desktop: everything (tiles, menus, modals, fields, buttons, pills) uses the window radius `--ws-radius` exactly (Hyprland `decoration:rounding`; fallback 0px, square). Never add an offset to it: the owner rejected rounded controls on the square desktop (2026-10-12). A panel has one frame; separators run edge to edge. The last rules that added +4..10px were brought back to the token on 2026-10-13. Borders take the desktop's `--ws-border` (`general:border_size`, minimum 1px; fallback 2px) for focus, 1px for hairlines.

Tile focus is drawn **inset** (an inset box-shadow on a pseudo-element), because day sections use layout/paint containment and an outset border would clip at section edges.

## Components

### Photo Tile (signature)
Every photo is a window.
- **Shape:** window radius (`--ws-radius`) on the container, image and focus layer.
- **Rest:** inset 1px hairline.
- **Focus / Hover:** inset `--ws-border` in the theme accent (hover counts as focus, like focus-follows-mouse); default outline suppressed. 140ms `cubic-bezier(0.22, 1, 0.36, 1)`; reduced motion: no transition.
- **Place caption:** city and country on a bottom black scrim, white 12px 600, fades in with focus (140ms); indented past the favourite star. Permanent on coarse pointers for tiles 200px and wider.

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
- **Workspace slide:** switching years slides the timeline layer out across the full width (170ms, ease-in `cubic-bezier(0.55, 0, 1, 0.45)`), jumps, and slides the new year in from the other side (240ms, ease-out `cubic-bezier(0.22, 1, 0.36, 1)`); older years arrive from the right. The month heading flies 40px in the direction of travel (260ms cubic-out). Reduced motion cuts straight to the year.

### Segmented Control (Years / Months / All)
- **Shell:** transparent, 1px hairline, the window radius, 3px inner padding; floating variant takes the surface and the popup shadow.
- **Options:** muted text, the window radius; pressed option inverts (ink fill, surface text).

### Sidebar Navigation
Compact icons on the shared ground. Items weight 500, the window radius; the active item inverts like the Omarchy bar's active workspace, icon inheriting the surface colour.

### Buttons and Links (empty states)
- **Primary action:** ink fill, surface text, 600 at 0.9rem, `0.55rem 1rem`, the window radius; hover mixes 15% accent into the ink.
- **Text link:** ink, 500 at 0.9rem, underline in hairline at 0.25em offset; the underline takes the accent on hover.
- **Focus:** `--ws-border` solid accent outline, 3px offset.

### Empty State
A sentence of why and one next step: headline title, body copy in muted ink (max 34rem column, top margin `clamp(3rem, 12vh, 8rem)`), then one primary action and at most one text link.

### Inputs / Fields (person name)
Transparent with no border at rest, ink 600, the window radius. The placeholder appears on the card under the pointer or on focus (140ms). Focus: ink tint 6% and `--ws-border` accent outline.

### Settings Section (SettingAccordion)
Settings and Administration › Settings are a column of rows on the page's own gutter (`.ws-page-column`, 60rem at most, left-aligned like the AI inbox; upstream centred a box), never cards.
- **Row:** icon 20px muted (ink while open or pointed at), title in the heading role (17px, 600, ink), the description under it in meta (13px, muted), a muted chevron; a hairline below every row; pointing tints the row ink 4%; focus is an inset `--ws-border` accent outline.
- **Open:** the row stays and its controls follow, indented under the title, the next hairline closing them. A section inside a section (Features › Albums) is the same row at UI size.
- **Controls:** labels ink, descriptions muted (upstream paints labels in the accent); fields, buttons and switches take the window radius; a switch is an outlined track with a muted thumb when off and inverted (ink track, surface thumb) when on; a section's own action is ink.

### Sharing and Shared links
Sections on the page's gutter, each headed by its name with its count in data type over a hairline (`.ws-sharing-heading`); partners are rows of avatar, name and address; a shared link is a row with a hairline below, title in ink. With nothing shared they are empty states (no upstream illustration): shared albums offer Create album and Shared links, shared links say where links come from and point to Albums.

### Special albums (To do, Villa)
Albums that keep photos out of Photos: To do (photos set aside to deal with later) and Villa. Moving a photo into one puts it in the album, tags it with the album's name and archives it, so it leaves Photos; taking it out (Mark done in To do, Remove from Villa) puts it back where it came from, and not while the other one still holds it. Each has a sidebar row under Favorites with the count at the row's end in data type (`.ws-nav-count`, muted; it inverts with the active row), and its album page lights that row, not Albums. Its move action sits beside Favorite in the selection bar and in the right-click menu; its way out is the album's primary (ink) selection action; its key (B To do, V Villa) does whichever applies, to the selection or, with nothing selected, to the photo under the pointer. Under the album's title one muted line says how it works (`.ws-album-note`). Before anything goes there, `/todo` and `/villa` are empty states that name the key and the right-click item.

### Album folders
Albums sit in folders, as they did on the Mac. Gallery keeps folders only inside a Space, so the Albums page shows the folders of the personal Space "Library": one level at a time, the level's folders first (the Space's folder cards, a collage of four covers under a folder badge, sorted by name the way a person numbers them, years in order), then its albums as before. Inside a folder a path of crumbs leads back up (Albums › Travel › Norway). A search, or the Shared filter, lists every album at once. New folder sits beside Create album; a folder's ⋮ renames, moves or deletes it (its albums move up a level); an album goes into a folder by Move to folder (right-click, the album's ⋮) or by dragging it onto a folder or a crumb. An album's back arrow returns to its folder.

### Filter Rail
Same surface as the ground with a hairline edge; collapsed by default. Its search and reopen buttons are transparent with a hairline border and no shadow.

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
