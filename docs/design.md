# Design guide

How TaskFlow looks, and how to build a new page that looks the same. Tokens live in `src/app/globals.css`; this page explains them. A unit test (`tests/unit/design-tokens.test.ts`) keeps the palette accessible and the two copies of the dark theme identical, and CI rejects raw Tailwind colours.

## Principles

1. **Four colours, used by role.** Pages never pick a colour; they pick a role (`bg-surface`, `text-muted`, `border-line`).
2. **Both themes for free.** Roles change value with the theme, so one class list works in light and dark. Never write `dark:` variants.
3. **Calm and dense.** One column, white space from a fixed scale, one accent colour for the main action of a page.
4. **Accessible by construction.** Contrast is tested, focus is always visible, every control has a text label.

## The palette

| Colour      | Roles                                                           | Used for                                                    |
| ----------- | --------------------------------------------------------------- | ----------------------------------------------------------- |
| **Neutral** | `page` `surface` `subtle` `line` `control` `fg` `muted`         | Backgrounds, cards, borders, input borders, text            |
| **Primary** | `primary` `primary-hover` `primary-fg` `link`                   | The main button, links, the brand name, keyboard focus ring |
| **Danger**  | `danger` `danger-hover` `danger-fg` `danger-text` `danger-soft` | Destructive buttons, error messages, the delete card        |
| **Success** | `success-text` `success-soft`                                   | "Saved." confirmations                                      |

| Role            | Light     | Dark      | Utility examples                                  |
| --------------- | --------- | --------- | ------------------------------------------------- |
| `page`          | `#f8fafc` | `#020617` | `bg-page`                                         |
| `surface`       | `#ffffff` | `#0f172a` | `bg-surface`                                      |
| `subtle`        | `#f1f5f9` | `#1e293b` | `bg-subtle` (badges, code, hover)                 |
| `line`          | `#e2e8f0` | `#334155` | `border-line` `divide-line` (decorative dividers) |
| `control`       | `#6b7a90` | `#64748b` | `border-control` (borders of inputs and buttons)  |
| `fg`            | `#0f172a` | `#f1f5f9` | `text-fg`                                         |
| `muted`         | `#475569` | `#94a3b8` | `text-muted` (secondary text)                     |
| `primary`       | `#4f46e5` | `#4f46e5` | `bg-primary`                                      |
| `primary-hover` | `#4338ca` | `#4338ca` | `hover:bg-primary-hover`                          |
| `primary-fg`    | `#ffffff` | `#ffffff` | `text-primary-fg` (text on `primary`)             |
| `link`          | `#4338ca` | `#a5b4fc` | `text-link` `outline-link`                        |
| `danger`        | `#b91c1c` | `#dc2626` | `bg-danger`                                       |
| `danger-hover`  | `#991b1b` | `#b91c1c` | `hover:bg-danger-hover`                           |
| `danger-fg`     | `#ffffff` | `#ffffff` | `text-danger-fg`                                  |
| `danger-text`   | `#b91c1c` | `#fca5a5` | `text-danger-text`                                |
| `danger-soft`   | `#fef2f2` | `#2a0f14` | `bg-danger-soft`                                  |
| `success-text`  | `#047857` | `#6ee7b7` | `text-success-text`                               |
| `success-soft`  | `#ecfdf5` | `#052e22` | `bg-success-soft`                                 |

### Contrast (WCAG 2.x)

Text needs 4.5:1; borders and focus rings that identify a control need 3:1. Selected ratios at the time of writing (the test is authoritative and checks all 19 text pairs and 5 control pairs in both themes):

| Pair                                  | Light |  Dark |
| ------------------------------------- | ----: | ----: |
| `fg` on `page`                        | 17.06 | 18.41 |
| `muted` on `surface`                  |  7.58 |  6.96 |
| `primary-fg` on `primary`             |  6.29 |  6.29 |
| `link` on `surface`                   |  7.90 |  8.96 |
| `danger-fg` on `danger`               |  6.47 |  4.83 |
| `danger-text` on `danger-soft`        |  5.91 |  9.40 |
| `success-text` on `surface`           |  5.48 | 11.71 |
| `control` on `surface` (input border) |  4.36 |  3.75 |

## Dark theme

- By default the site follows the system (`prefers-color-scheme`). The header button cycles **Auto → Light → Dark**.
- A chosen theme is stored in the `theme` cookie (not sensitive, one year) and rendered by the server as `data-theme` on `<html>`, so there is no flash on load. "Auto" removes the cookie.
- The dark values exist twice in `globals.css` (system preference and explicit choice) because CSS cannot share one rule across a media query and an attribute. The unit test fails if they differ.

## Layout, type and spacing

| Thing            | Rule                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| Page container   | Provided by the root layout: `max-w-4xl`, `px-4 py-8`. A page renders its own `<main>` and does not add a container |
| Vertical rhythm  | `space-y-6` between sections of a page, `space-y-4` inside a card, `space-y-8` when a list is followed by a form    |
| Page title       | `<h1 className="text-2xl font-semibold">`, one per page                                                             |
| Section title    | `<h2 className="text-lg font-semibold">` inside a card                                                              |
| Body / secondary | default size / `text-sm text-muted`                                                                                 |
| Cards            | `card` (radius `lg`, padding `p-5`, 1px `line` border, small shadow)                                                |
| Controls         | radius `md`, `text-sm`; buttons `px-3 py-2`                                                                         |
| Lists of items   | `grid gap-3 sm:grid-cols-2` of `card` links; rows inside a card use `divide-y divide-line`                          |
| Breakpoints      | Mobile first: one column, add `sm:` only to widen. Nothing may scroll horizontally at 375 px                        |

## Components

All are classes defined in `globals.css`; add to them, do not restyle per page.

| Class              | Use                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `btn`              | The one main action of a form or page                                                                                               |
| `btn-secondary`    | Any other action (works on `<button>` and `<Link>`)                                                                                 |
| `btn-danger`       | Destructive and irreversible actions only                                                                                           |
| `field` + `input`  | A label wrapping its control: `<label className="field">Name<input className="input" /></label>` (also for `select` and `textarea`) |
| `card`             | A section of content                                                                                                                |
| `card-danger`      | The delete-project zone                                                                                                             |
| `badge`            | Short status such as a role; text is capitalised for you                                                                            |
| `link`             | Inline text links                                                                                                                   |
| `error` / `notice` | Error and success messages; add `role="alert"` / `role="status"`                                                                    |

## Recipe for a new page

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/session";

export default async function ExamplePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Title</h1>
      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">Section</h2>
        <p className="text-muted">Explanation in the secondary colour.</p>
        <button type="button" className="btn">
          Main action
        </button>
      </section>
    </main>
  );
}
```

## Accessibility rules

- Every control has a visible text label; icon-only buttons are not used.
- Keyboard focus is a 2px outline in `link` colour (`focus-visible`); never remove it.
- Errors use `role="alert"`, confirmations `role="status"`; never rely on colour alone (the message says what happened).
- Headings go in order; the layout provides the "Skip to content" link and a labelled main navigation.
- Not yet audited: touch-target size (buttons are about 36 px tall), reduced motion (there is no animation), and a screen-reader pass. These belong to TF-07.

## Rules that are enforced

1. **CI guard:** no raw Tailwind colour classes (`bg-indigo-600`, `text-slate-500`, `bg-white`, `text-black`, ...) anywhere in `src/`.
2. **Unit test:** the palette keeps AA contrast, the dark copies match, and every role is exposed to Tailwind.

## Adding a colour role

1. Add the variable to the three blocks of `globals.css` and a `--color-<role>: var(--<role>);` line in `@theme inline`.
2. Add its text and control pairs to `tests/unit/design-tokens.test.ts`.
3. Add it to the table above. If it does not fit one of the four colours, it probably should not exist.
