# UI Professional Refresh — Design

**Date:** 2026-06-17
**Scope:** Whole web app (`web/src`). Dense SaaS-dashboard look + light/dark theme.

## Goal

The app currently caps content at `max-width: 1040px` on a flat all-white surface,
leaving large empty gutters on wide screens and looking sparse. Make it feel like a
professional SaaS dashboard (Linear/Vercel/Stripe family) that uses the full width,
with a proper light/dark theme.

## Decisions (from brainstorming)

- **Scope:** whole app — refresh shared `styles.css`, the shell, and add a theme toggle.
- **Direction:** dense SaaS dashboard — full-width content, depth via canvas vs cards,
  tighter polished components, more data visible.
- **Theme:** keep indigo accent, refine it, and add a real light + dark theme.
- **Theme toggle:** sidebar footer.
- **Nav:** add simple inline SVG icons next to each nav label.

## Architecture

All views already share one CSS vocabulary (`.ts-page`, `.ts-card`, `.ts-table`,
`.ts-header/.ts-h1/.ts-sub`, `.input`, `.btn`, `.chip`, `.link-btn`). So most of the
work is global CSS; JSX changes are limited to the shell and a new theme module.

### 1. Theming system
- Treat existing `:root` as the **light** theme.
- Add `[data-theme="dark"]` block overriding the same CSS variables (dark slate canvas,
  lighter elevated cards, adjusted borders/shadows, brightened indigo for contrast).
- New `web/src/theme.ts`: read/persist choice in `localStorage` (`ui-theme`), fall back
  to `prefers-color-scheme` on first visit, apply `data-theme` to `document.documentElement`.
- New `web/src/ThemeToggle.tsx`: sun/moon button rendered in the sidebar footer.
- Apply initial theme in `main.tsx` before render to avoid a flash.

### 2. Layout / space
- Introduce **app canvas vs card** depth: `--bg` becomes a subtle gray (light) / dark
  slate (dark); cards stay elevated white/`--card`.
- Remove the `1040px` content cap: `.ts-page` goes full-width (generous large max so
  ultra-wide monitors stay readable) with comfortable shell gutters.
- Refine sidebar: sticky full-height, clearer brand, nav items with icons, polished
  user + theme-toggle footer.

### 3. Component polish (global, no per-view JSX churn)
- **Tables:** sticky header, consistent zebra/hover, aligned numeric cells, refined
  borders that work in both themes.
- **Tiles:** crisper cards, accent tile keeps strong contrast in both themes.
- **Buttons / inputs / chips / badges:** theme-aware borders, hover, focus rings.
- **Page header (`.ts-header`):** becomes a proper header band (title + subtitle, room
  for actions) with a divider.

## Out of scope
- No data/logic changes. No new dependencies (icons are inline SVG).
- No restructuring of individual PM view markup beyond what global CSS achieves.

## Verification
- `npm run build` (runs `tsc -b` typecheck + vite build) passes.
- Existing tests (`npm test`) still pass (no logic touched).
- Manual: toggle theme, resize to wide screen, sanity-check each view.
