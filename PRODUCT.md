# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **The archivist (primary):** the owner, at their Linux desk (cypherpunk: a 4K AORUS landscape monitor plus a portrait Dell, mouse and keyboard, Omarchy/Hyprland desktop with hand-built themes). They both drift through the archive and tend it.
- **Family members:** accounts or shared Spaces, browsing from their own browsers and phones.
- **The room:** photos shown on a TV or cast screen for several people at once.
- **Mobile web:** the same web UI opened on a phone, alongside the native apps.

## Product Purpose

A private home for one family's photo and video history: an exported Apple Photos archive spanning 1977 to today (about 28k assets, growing), plus ongoing phone backups. Success is that opening it makes you want to stay. The years, people and places resurface on their own, and the archive keeps getting better organised (named faces, correct dates and places).

## Positioning

Self-hosted Noodle Gallery (a community fork of Immich), on the owner's own hardware with an RTX 5090 doing the machine learning. It offers smart search, OCR, face clustering with suggestions, pet and video-duplicate detection, Spaces and richer Memories, with no cloud provider in between. The web UI is the owner's own layer over upstream code, a deliberate fork, so it is their instrument rather than a hosted product. Curator, a local AI service beside Gallery, proposes changes (albums, dates, places, restorations) that wait in an inbox for a yes.

## Operating Context

- **Two modes of use:** *relive and wander* (drift through years, Memories, places, people; nostalgia without a goal) and *curate* (name faces, fix dates and places, clean duplicates, build albums).
- **Long first import:** processing runs for hours after big imports, so partial states (unnamed faces, empty Memories) are normal for a while.
- **Desktop integration:** the desktop theme changes often (about 50 themes). The UI already follows it via generated Custom CSS (`~/.local/bin/immich-omarchy-theme`, run from a theme-set hook), and any redesign must keep taking its palette from that.

## Capabilities and Constraints

- **Change scope:** anything in the web UI, structure included: screens, navigation, components, flows, as well as fonts, tokens, layouts, empty states and copy. The owner accepts a deeper fork (since 2026-10-15): upstream releases are merged into branch `local/omarchy` with AI help rather than kept trivially rebaseable. A redesign may replace an upstream screen whole; prefer our own components and routes over edits scattered through upstream files when the result is the same, and list every structural departure in DESIGN.md so a merge knows what is ours.
- **Upstream code:** the server and its API stay upstream's for now (the native iOS and Android apps depend on them); engine changes happen only when the owner asks for them. Curator is ours and can grow new endpoints for the UI.
- **Build:** `./local-build.sh` builds only the web stage (branding applied on a copy) and installs to `~/immich/web-custom`, mounted over `/build/www`.
- **Preview while designing:** `./local-dev.sh start` serves this checkout's `web/src` with hot reload at `http://localhost:2284`, against the live Gallery and Curator and logged in through the browser's localhost session. Look there after every edit instead of rebuilding; deploy with `local-build.sh` once it is right. Upstream names show there ("Immich"), since branding is applied only by the build.
- **Seeing it:** `./local-dev.sh shots` takes headless screenshots of the main pages at the owner's real sizes (AORUS 2560×1440, Dell portrait 1296×2304, plus laptop, tablet and phone; dark and light) into `~/.cache/gallery-shots/<time>/` with a contact sheet; `--routes`, `--viewports`, `--modes`, `--all`, `--hidpi` narrow or widen it, and `--compare RUN_A RUN_B` shows what changed between two runs. It uses its own browser profile, logged in once by the owner with `./local-dev.sh login`. Take a run before a redesign and after it.
- **Live variants:** `impeccable live --target web` (config in `web/.impeccable/live/`) puts the element picker on the dev server's pages; accepted variants are written to source.
- **Strings:** user-facing strings go through i18n (`i18n/en.json` plus the nine maintained locales, if a commit is ever upstreamed).
- **Known bugs in reach:** `/search?query=<plain text>` crashes the page; the search hint shows "⌘K" on Linux.

## Evidence on Hand

- **Real library:** the archive on the running instance at http://localhost:2283, and the dev checkout in `~/code/gallery`.
- **Prior critique:** `~/immich/.impeccable/critique/` scored 23/40. Its main issues were the generic Google Material look, empty and partial states that give nothing back, the filter rail crowding the timeline, and inconsistencies on the search page.
- **No fabricated data:** no testimonials, metrics or third-party users exist; none should be invented.

## Product Principles

1. **The photos are the brightest thing on screen.** Chrome recedes and never competes with the photos.
2. **Time is the spine.** Fifty years is the defining shape of this archive; make that shape visible and easy to move through.
3. **Partial is normal.** Every empty or in-progress state explains itself and offers the next step.
4. **The desktop decides the palette.** The UI is a citizen of the Omarchy theme, not a brand of its own.
5. **Fork deliberately.** Change structure where it makes the archive clearly better, not for its own sake; where it costs nothing, keep upstream mergeable (our own components and routes rather than edits scattered through upstream files), and record each structural departure in DESIGN.md.

## Accessibility & Inclusion

Mixed audience (family, a TV across the room): text contrast at least WCAG AA, readable at TV distance on cast or slideshow surfaces, keyboard-first on desktop.
