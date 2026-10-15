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

A private home for one family's photo and video history: an exported Apple Photos archive spanning 1977 to today (about 10k assets, growing), plus ongoing phone backups. Success is that opening it makes you want to stay. The years, people and places resurface on their own, and the archive keeps getting better organised (named faces, correct dates and places).

## Positioning

Self-hosted Noodle Gallery (a community fork of Immich), on the owner's own hardware with an RTX 5090 doing the machine learning. It offers smart search, OCR, face clustering with suggestions, pet and video-duplicate detection, Spaces and richer Memories, with no cloud provider in between. The web UI is a local visual layer over upstream code, so it is the owner's own instrument rather than a hosted product.

## Operating Context

- **Two modes of use:** *relive and wander* (drift through years, Memories, places, people; nostalgia without a goal) and *curate* (name faces, fix dates and places, clean duplicates, build albums).
- **Long first import:** processing runs for hours after big imports, so partial states (unnamed faces, empty Memories) are normal for a while.
- **Desktop integration:** the desktop theme changes often (about 50 themes). The UI already follows it via generated Custom CSS (`~/.local/bin/immich-omarchy-theme`, run from a theme-set hook), and any redesign must keep taking its palette from that.

## Capabilities and Constraints

- **Change scope:** the visual layer only (fonts, tokens, components, layouts, empty states, copy), applied as a small patch set on branch `local/omarchy` and rebased onto each Gallery release. Restructuring screens or navigation is out of scope.
- **Upstream code:** server code and the API are untouched.
- **Build:** `./local-build.sh` builds only the web stage (branding applied on a copy) and installs to `~/immich/web-custom`, mounted over `/build/www`.
- **Preview while designing:** `./local-dev.sh start` serves this checkout's `web/src` with hot reload at `http://localhost:2284`, against the live Gallery and Curator and logged in through the browser's localhost session. Look there after every edit (screenshots, live variants) instead of rebuilding; deploy with `local-build.sh` once it is right. Upstream names show there ("Immich"), since branding is applied only by the build.
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
5. **Stay rebaseable.** Prefer token, style and component-level changes over structural forks.

## Accessibility & Inclusion

Mixed audience (family, a TV across the room): text contrast at least WCAG AA, readable at TV distance on cast or slideshow surfaces, keyboard-first on desktop.
