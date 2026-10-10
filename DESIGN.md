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
    fontSize: "clamp(2.5rem, 0.9rem + 4.6vw, 6rem)"
    fontWeight: 800
    lineHeight: 0.85
    letterSpacing: "-0.035em"
    fontVariation: "'wdth' 75, 'opsz' 96"
  display-month:
    fontFamily: "'Bricolage Grotesque Variable', 'Mona Sans', ui-sans-serif, sans-serif"
    fontSize: "clamp(2.5rem, 0.9rem + 4.6vw, 6rem)"
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
    fontSize: "15px"
    fontWeight: 650
    letterSpacing: "-0.01em"
    fontFeature: "'tnum'"
  body:
    fontFamily: "'Mona Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: "'ss01', 'ss02'"
  label:
    fontFamily: "'Mona Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 600
  data:
    fontFamily: "var(--omarchy-font-mono, 'JetBrainsMono Nerd Font'), 'GoogleSansCode', ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 600
    fontFeature: "'tnum'"
rounded:
  window: "0px"
  pill: "5px"
  control: "6px"
  segmented: "8px"
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
- **Display** (800, condensed `wdth 75`, `clamp(2.5rem, 0.9rem + 4.6vw, 6rem)`, line-height 0.85, -0.035em): the year in view in the timeline header.
- **Display Month** (500, same size and width): the month name beside it, first letter capitalised. Weight contrast, not size, separates month from year.
- **Headline** (750, `wdth 80`, `clamp(1.75rem, 1.2rem + 1.6vw, 2.5rem)`, line-height 1.05, balanced wrap): empty-state titles.
- **Title** (650, 15px, -0.01em, tabular numerals, display face): day labels in the timeline ("Mon, Dec 31, 2018"; "Mon 31" below 768px).
- **Body** (400, 1rem, line-height 1.55, max 60ch): explanatory copy, empty-state bodies.
- **Label** (600, 0.9rem): button and link text in the layer's own controls; place captions at 12px 600.
- **Data** (600, 12px, tabular, monospace): counts ("59 items"), year pills, dates, EXIF, workspace numbers.

### Named Rules
**The Scale Contrast Rule.** Hierarchy comes from the jump between 6rem condensed numerals and 12px data, not from a ladder of medium sizes.

**The Data Is Mono Rule.** A number that is information (count, year, date, EXIF) is set in the desktop's monospace. A number that is a heading (the year in view, a day label) is set in the display face.

## Layout

**The gap module.** `--ws-gap` (fallback 10px) is Hyprland's inner gap times two, the space between two tiled windows. It is the justified-layout spacing between photos (read by `VirtualScrollManager` at layout time) and derives the header rhythm: strip pills step at 0.4 gap, the header sits 0.6 gap above and 0.8 gap below, and 2.4 gap splits the month heading from the year strip.

**Rows fill the width.** Days that fit on one line are pooled into a shared row and re-laid at one height so the row ends exactly at the viewport edge (photos shrink by at most 0.72x, grow up to 70% of viewport height). A day too wide for one line takes the row to itself, its photos split into balanced lines each justified to full width, so no line ends on an orphan tile. Only a month's last row may stay short (growth capped at 1.6x). While any day's layout is deferred, the upstream packing is the fallback.

**Shell.** Top bar on the surface with a hairline below; search leads, right after the logo, at every width. Sidebar shares the ground with a hairline edge. The filter rail starts collapsed; the timeline leads. The timeline header carries the month in view at display size with its count, and the year workspace strip beside it (stacked under it below 768px, with its edge masks off).

**Responsive.** Below 768px: header stacks, day labels shorten to weekday + date, the grouping control floats at the bottom. On coarse pointers, tiles at least 200px wide show their place caption permanently.

## Elevation & Depth

Flat on the ground; depth only for what floats above it, like a Hyprland popup. Upstream `shadow-sm/md/lg` utilities are zeroed. Tiles have no shadow; their edge is an inset hairline.

### Shadow Vocabulary
- **Popup** (`box-shadow: 0 12px 32px -8px rgb(0 0 0 / 0.28)` plus a 1px hairline border): menus, dialogs, listboxes, and the floating (mobile) grouping control.

### Named Rules
**The Floats Only Rule.** A shadow means the element floats over the ground and can be dismissed. Anything that lives on the ground is flat.

## Shapes

Corners come from the desktop. Tiles (and their images and focus ring) use the window radius `--ws-radius` (Hyprland `decoration:rounding`; fallback 0px, square). Controls stay recognisable as controls even on a square desktop by adding a fixed offset to the same radius: year pills and segmented options +5px, sidebar items, empty-state buttons and name fields +6px, the segmented control shell +8px. Borders take the desktop's `--ws-border` (`general:border_size`, minimum 1px; fallback 2px) for focus, 1px for hairlines.

Tile focus is drawn **inset** (an inset box-shadow on a pseudo-element), because day sections use layout/paint containment and an outset border would clip at section edges.

## Components

### Photo Tile (signature)
Every photo is a window.
- **Shape:** window radius (`--ws-radius`) on the container, image and focus layer.
- **Rest:** inset 1px hairline.
- **Focus / Hover:** inset `--ws-border` in the theme accent (hover counts as focus, like focus-follows-mouse); default outline suppressed. 140ms `cubic-bezier(0.22, 1, 0.36, 1)`; reduced motion: no transition.
- **Place caption:** city and country on a bottom black scrim, white 12px 600, fades in with focus (140ms); indented past the favourite star. Permanent on coarse pointers for tiles 200px and wider.

### Year Workspace Strip (signature)
The archive's years as workspace numbers, newest first.
- **Pill:** monospace 12px 600, muted, transparent; hover tints ink 7% and raises to ink; active (the year under the viewport) inverts to ink fill and surface text; focus outline `--ws-border` accent, 2px offset.
- **Behaviour:** horizontally scrolling, scrollbar hidden, 2rem edge masks; the active pill scrolls to centre. `[` and `]` step to the older/newer year (ignored in inputs and while the viewer is open).
- **Workspace slide:** switching years slides the timeline layer out across the full width (170ms, ease-in `cubic-bezier(0.55, 0, 1, 0.45)`), jumps, and slides the new year in from the other side (240ms, ease-out `cubic-bezier(0.22, 1, 0.36, 1)`); older years arrive from the right. The month heading flies 40px in the direction of travel (260ms cubic-out). Reduced motion cuts straight to the year.

### Segmented Control (Years / Months / All)
- **Shell:** transparent, 1px hairline, radius +8px, 3px inner padding; floating variant takes the surface and the popup shadow.
- **Options:** muted text, radius +5px; pressed option inverts (ink fill, surface text).

### Sidebar Navigation
Compact icons on the shared ground. Items weight 500, radius +6px; the active item inverts like the Omarchy bar's active workspace, icon inheriting the surface colour.

### Buttons and Links (empty states)
- **Primary action:** ink fill, surface text, 600 at 0.9rem, `0.55rem 1rem`, radius +6px; hover mixes 15% accent into the ink.
- **Text link:** ink, 500 at 0.9rem, underline in hairline at 0.25em offset; the underline takes the accent on hover.
- **Focus:** `--ws-border` solid accent outline, 3px offset.

### Empty State
A sentence of why and one next step: headline title, body copy in muted ink (max 34rem column, top margin `clamp(3rem, 12vh, 8rem)`), then one primary action and at most one text link.

### Inputs / Fields (person name)
Transparent with no border at rest, ink 600, radius +6px. The placeholder appears on the card under the pointer or on focus (140ms). Focus: ink tint 6% and `--ws-border` accent outline.

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
