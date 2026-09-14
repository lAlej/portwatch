# Design — Docker Management Dashboard

A locked design system for this app. Every page reads this file before emitting
code. Do not regenerate per page — extend or amend this file when the system
needs to grow.

## Genre
**modern-minimal** — Stripe / Linear / ElevenLabs school: confident sans
display, generous whitespace, pill CTAs, monochrome with a single restrained
accent.

## Macrostructure family
- **Dashboard** (`/`) — **Bento Grid**. Vary tiles per metric family: stat tiles
  span differently; the containers table gets a wide asymmetric span. No
  equal-column row of identical cards.
- **Container detail** (`/containers/:id`) — **Long Document**. Header band
  with state + live indicator, then a stats strip, then a tab strip
  (stats · logs · inspect). Single column, generous padding.
- **Login** (`/login`) — **Single-card centre**. Asymmetric paper: wordmark
  in the upper-left corner, card aligned to the left third, password
  centred vertically.

## Theme
Light. Restrained cobalt accent (the single non-neutral colour on the page).
Anchor hue: warm-neutral 80° for neutrals; cobalt accent at 255°.

```css
:root {
  /* paper & ink */
  --color-paper:     oklch(98.5% 0.004 80);   /* warm near-white */
  --color-paper-2:   oklch(96.0% 0.005 80);   /* raised surface */
  --color-paper-3:   oklch(93.0% 0.006 80);   /* hover / input bg */
  --color-rule:      oklch(91.0% 0.008 80);   /* hairline borders */
  --color-muted:     oklch(55.0% 0.010 70);   /* secondary text */
  --color-ink:       oklch(22.0% 0.012 60);   /* primary text */
  --color-ink-2:     oklch(38.0% 0.012 60);   /* headings */

  /* accent — single restrained cobalt */
  --color-accent:        #0046FF;             /* signal cobalt */
  --color-accent-soft:   #1a5cff;             /* hover */
  --color-accent-ink:    #ffffff;             /* text on accent fill */

  /* state */
  --color-state-running:  oklch(58% 0.16 152); /* green */
  --color-state-paused:   oklch(72% 0.16 75);  /* amber */
  --color-state-exited:   oklch(55% 0.012 70); /* muted grey */
  --color-state-error:    oklch(58% 0.20 28);  /* red */

  /* focus */
  --color-focus:      oklch(50% 0.22 255);
}
```

Accent occupies ≤ 3 % of any viewport. Used for: focus rings, the active
nav item dot, the "live" indicator, the active tab underline, and the
primary CTA fill on `/login` only.

## Typography
- **Display:** `"Inter Tight"`, 500–700, letter-spacing `-0.025em`. Headings,
  section titles, the dashboard wordmark.
- **Body:** `"Inter Tight"`, 400–500. UI text, labels, buttons.
- **Outlier:** `"JetBrains Mono"`, 400–500. **Two slots only:** the docker
  wordmark `docker /dashboard` path, and any code / timestamp / id strings.
  Three-family ceiling.
- Display tracking: `-0.025em` on `--text-display` and below.
- Scale: 1.25 ratio from 16 px body.

```css
:root {
  --text-xs:      0.75rem;
  --text-sm:      0.875rem;
  --text-base:    1rem;
  --text-md:      1.125rem;
  --text-lg:      1.4375rem;
  --text-xl:      1.8125rem;
  --text-2xl:     2.3125rem;
  --text-display: clamp(2.25rem, 4vw + 0.5rem, 3.5rem);
}
```

Min body 14 px (we use 16). Tabular nums on any column of numbers.
`max-width: 65ch` on prose.

## Spacing
4 pt named scale. Pages must use named tokens, never raw px.

```css
:root {
  --space-3xs: 0.125rem;
  --space-2xs: 0.25rem;
  --space-xs:  0.5rem;
  --space-sm:  0.75rem;
  --space-md:  1rem;
  --space-lg:  1.5rem;
  --space-xl:  2.5rem;
  --space-2xl: 4rem;
  --space-3xl: 6rem;
}
```

## Radius
Single radius scale. **Most things are 10 px** — soft but not pill-rounded.
Pills only for buttons and small badges.

```css
:root {
  --radius-input: 8px;
  --radius-card:  10px;
  --radius-pill:  999px;
}
```

## Motion
- Easings: `--ease-out`, `--ease-in`, `--ease-in-out` (no `ease`, no bounce).
- Durations: `--dur-micro: 120ms`, `--dur-short: 200ms`, `--dur-long: 320ms`.
- Animate `transform` + `opacity` only.
- One orchestrated entrance on first load (stagger ≤ 500 ms total).
- No scroll-linked reveals.
- Reduced-motion fallback: opacity crossfade ≤ 150 ms.

```css
:root {
  --ease-out:    cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in:     cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-micro:   120ms;
  --dur-short:   200ms;
  --dur-long:    320ms;
}
```

## Microinteractions stance
- **Silent success.** No celebratory toasts for "saved" — the table updates
  in place. Toasts only for failures.
- **Optimistic update** for container start/pause/restart/kill — execute, no
  confirmation modal. The row reflects the new state on the next socket
  push. (No destructive action requires a confirmation modal because kill
  is reversible: container restarts.)
- **No hover-only affordances.** Every hover state has a focus-visible
  equivalent. Tab strips, action buttons, container rows all reachable by
  keyboard.
- **Focus rings appear instantly**, never animated.
- **No tooltips with delay** on focus (0 ms); on hover (700 ms) when used.

## CTA voice
- **Primary CTA** — pill-shaped, filled with `--color-accent`, `--color-accent-ink`
  text. Used once per view (login "Sign in" only on this app).
- **Secondary CTA / icon button** — square (36×36 px), ghost, `--color-ink-2`
  text on hover `--color-paper-3` background, focus-visible ring.

## Z-index
Six-level named scale. No `9999`.

```css
:root {
  --z-base:     1;
  --z-raised:   10;
  --z-dropdown: 100;
  --z-sticky:   200;
  --z-modal:    400;
  --z-toast:    500;
  --z-tooltip:  600;
}
```

## Page-edge clipping
Mandatory on root, allows decorative overflows (clipped-edge mockup,
oversized stat) without horizontal scroll:

```css
html, body { overflow-x: clip; }
```

## What pages MUST share
- The wordmark `docker` (Inter Tight 600) + the `/dashboard` path in mono.
- The accent (`--color-accent`) and its placement rules.
- The display + body + outlier fonts and their roles.
- The CTA voice (pill primary, square ghost secondary).
- The state colour map (running/paused/exited/error).

## What pages MAY differ on
- Macrostructure within the family (Bento vs Long Document vs single-card).
- Component archetypes within the family's allowance.
- Section spacing rhythm (Bento tiles may be tighter than Long Document).
- Tabs, pill placement, table row density.

## Exports

Drop-in formats for re-using this design system in other projects.

### Tailwind config (current project)

```js
// tailwind.config.js (excerpt)
theme: {
  extend: {
    colors: {
      paper:   'var(--color-paper)',
      panel:   'var(--color-paper-2)',
      raised:  'var(--color-paper-3)',
      rule:    'var(--color-rule)',
      muted:   'var(--color-muted)',
      ink:     'var(--color-ink)',
      heading: 'var(--color-ink-2)',
      accent:  'var(--color-accent)',
    },
    fontFamily: {
      sans: ['Inter Tight', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
    },
    borderRadius: {
      card:  'var(--radius-card)',
      pill:  'var(--radius-pill)',
      input: 'var(--radius-input)',
    },
  },
},
```

### Tokens as CSS variables

Already declared in `src/index.css`. Pages reference by name (`var(--color-accent)`,
`var(--space-lg)`). No inline values mid-render.