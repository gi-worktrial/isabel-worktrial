# Design spec

The tokens the product paints with, generated from `src/platform/styles/tokens.css`, `src/styles/tokens-demo.css` and `src/platform/styles/type.css` by `node scripts/design-spec.ts --write`. `pnpm check` fails when this file is out of date. How to use them (spacing, rows, icons, dense information, one primary per view) is in the [grounded-design skill](../.agents/skills/grounded-design/SKILL.md).

Spacing sits on a 4px grid, which the `repo/layout-spacing-scale` lint enforces. Light is the default theme and dark comes only from the toggle.

## Colors

Use a color as a Tailwind utility on its name (`bg-surface`, `text-muted`, `border-divider`), never as a raw value.

| Token | Light | Dark | What it is for |
| --- | --- | --- | --- |
| `white` | `#ffffff` | same |  |
| `black` | `#000000` | same |  |
| `surface` | `#ffffff` | `#000000` |  |
| `subtle` | `#f8f8f8` | `#141414` |  |
| `overlay` | `#ffffff` | `#111111` |  |
| `fill` | `#f2f2f2` | `#1a1a1a` |  |
| `inset` | `#eeeeee` | `#242424` |  |
| `divider` | `#e0e0e0` | `#2a2a2a` |  |
| `divider-strong` | `#cccccc` | `#404040` |  |
| `ring` | `#a8a8a8` | `#878787` |  |
| `ink` | `#333333` | `#ededed` |  |
| `muted` | `#757575` | `#a1a1a1` |  |
| `faint` | `#9e9e9e` | `#707070` |  |
| `accent` | `#2d7ff9` | `#18bfff` |  |
| `accent-ink` | `#2750ae` | `#5ccfff` |  |
| `primary` | `#1f1f1f` | `#ededed` | The primary button is ink, since blue stays for links and live states. |
| `on-primary` | `#ffffff` | `#0a0a0a` | The primary button is ink, since blue stays for links and live states. |
| `success` | `#338a17` | `#4cd263` | The primary button is ink, since blue stays for links and live states. |
| `success-ink` | `#2b7413` | `#4cd263` | The primary button is ink, since blue stays for links and live states. |
| `danger` | `#ba1e45` | `#ff6b8e` | The primary button is ink, since blue stays for links and live states. |
| `warning` | `#b87503` | `#ffc53d` | The primary button is ink, since blue stays for links and live states. |
| `warning-ink` | `#8f5b00` | `#ffc53d` | The primary button is ink, since blue stays for links and live states. |
| `accent-tint` | `#cfdfff` | `rgb(24 191 255 / 0.12)` |  |
| `success-tint` | `#d1f7c4` | `rgb(32 201 51 / 0.12)` |  |
| `danger-tint` | `#ffdce5` | `rgb(248 43 96 / 0.13)` |  |
| `warning-tint` | `#ffeab6` | `rgb(252 180 0 / 0.12)` |  |
| `teal` | `#0b6e69` | `#4fd8c4` |  |
| `teal-tint` | `#c2f5e9` | `rgb(32 217 210 / 0.12)` |  |
| `purple` | `#6b1cb0` | `#c49bff` |  |
| `purple-tint` | `#ede2fe` | `rgb(139 70 255 / 0.16)` |  |
| `selection` | `#e7efff` | `rgb(24 191 255 / 0.14)` |  |
| `link` | `#e8eef7` | `#161d29` |  |
| `link-ink` | `#3b4a63` | `#a9b8cf` |  |
| `tip` | `#333333` | `#3a3a3a` |  |
| `on` | `#20c933` | `#20c933` |  |
| `trace-1` | `#2a78d6` | `#3987e5` | one color per compared trace (blue, orange, aqua), checked apart for color vision in both themes; always beside its name |
| `trace-2` | `#eb6834` | `#d95926` | one color per compared trace (blue, orange, aqua), checked apart for color vision in both themes; always beside its name |
| `trace-3` | `#1baf7a` | `#199e70` | one color per compared trace (blue, orange, aqua), checked apart for color vision in both themes; always beside its name |
| `branch-1` | `#784a84` | `#cfa3da` | one muted hue per Candidate branch (mauve, slate, sage, ochre, clay, rose, so the hues nearest the outcome colors come last): words and icon on its tint, at AA; always with the branch icon and name |
| `branch-1-tint` | `#efe6f1` | `rgb(154 99 168 / 0.16)` | one muted hue per Candidate branch (mauve, slate, sage, ochre, clay, rose, so the hues nearest the outcome colors come last): words and icon on its tint, at AA; always with the branch icon and name |
| `branch-2` | `#3e5d86` | `#9db7dd` | one muted hue per Candidate branch (mauve, slate, sage, ochre, clay, rose, so the hues nearest the outcome colors come last): words and icon on its tint, at AA; always with the branch icon and name |
| `branch-2-tint` | `#e5ebf3` | `rgb(91 130 189 / 0.16)` | one muted hue per Candidate branch (mauve, slate, sage, ochre, clay, rose, so the hues nearest the outcome colors come last): words and icon on its tint, at AA; always with the branch icon and name |
| `branch-3` | `#4f6630` | `#adc58a` | one muted hue per Candidate branch (mauve, slate, sage, ochre, clay, rose, so the hues nearest the outcome colors come last): words and icon on its tint, at AA; always with the branch icon and name |
| `branch-3-tint` | `#e8eddc` | `rgb(122 154 76 / 0.16)` | one muted hue per Candidate branch (mauve, slate, sage, ochre, clay, rose, so the hues nearest the outcome colors come last): words and icon on its tint, at AA; always with the branch icon and name |
| `branch-4` | `#7a5c1c` | `#d9bb7a` | one muted hue per Candidate branch (mauve, slate, sage, ochre, clay, rose, so the hues nearest the outcome colors come last): words and icon on its tint, at AA; always with the branch icon and name |
| `branch-4-tint` | `#f2eada` | `rgb(176 138 58 / 0.16)` | one muted hue per Candidate branch (mauve, slate, sage, ochre, clay, rose, so the hues nearest the outcome colors come last): words and icon on its tint, at AA; always with the branch icon and name |
| `branch-5` | `#9c4a2b` | `#e9a283` | one muted hue per Candidate branch (mauve, slate, sage, ochre, clay, rose, so the hues nearest the outcome colors come last): words and icon on its tint, at AA; always with the branch icon and name |
| `branch-5-tint` | `#f6e6dd` | `rgb(198 106 68 / 0.16)` | one muted hue per Candidate branch (mauve, slate, sage, ochre, clay, rose, so the hues nearest the outcome colors come last): words and icon on its tint, at AA; always with the branch icon and name |
| `branch-6` | `#9a3f5c` | `#e89ab0` | one muted hue per Candidate branch (mauve, slate, sage, ochre, clay, rose, so the hues nearest the outcome colors come last): words and icon on its tint, at AA; always with the branch icon and name |
| `branch-6-tint` | `#f7e6ea` | `rgb(208 87 122 / 0.16)` | one muted hue per Candidate branch (mauve, slate, sage, ochre, clay, rose, so the hues nearest the outcome colors come last): words and icon on its tint, at AA; always with the branch icon and name |

## Type

| Utility | Definition |
| --- | --- |
| `type-title-18` | `font-sans text-[18px]/[26px] font-semibold tracking-[-0.25px]` |
| `type-heading-15` | `font-sans text-[15px]/[22px] font-semibold tracking-[-0.15px]` |
| `type-copy-14` | `font-sans text-[14px]/[20px] font-normal tracking-[-0.1px]` |
| `type-label-13` | `font-sans text-[13px]/[20px] font-normal tracking-[-0.05px]` |
| `type-meta-12` | `font-sans text-[12px]/[18px] font-normal` |
| `type-mono-12` | `font-mono text-[12px]/[18px] font-normal` |

## Radii, shadow, fonts, motion and widths

| Token | Value |
| --- | --- |
| `font-sans` | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Geist Variable", Geist, system-ui, sans-serif` |
| `font-mono` | `ui-monospace, "SF Mono", "Geist Mono Variable", "Geist Mono", monospace` |
| `radius-xs` | `4px` |
| `radius-sm` | `6px` |
| `radius-md` | `12px` |
| `radius-control` | `calc(var(--radius-md) - 4px)` |
| `radius-2xl` | `16px` |
| `shadow-float` | `0 1px 1px rgb(0 0 0 / 0.02), 0 4px 8px -4px rgb(0 0 0 / 0.04), 0 16px 24px -8px rgb(0 0 0 / 0.08)` |
| `container-reading` | `680px` |
| `container-page` | `1280px` |
| `ease-out` | `cubic-bezier(0.2, 0, 0, 1)` |
| `ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` |
| `default-transition-duration` | `120ms` |
| `default-transition-timing-function` | `var(--ease-out)` |
| `animate-enter` | `enter 120ms var(--ease-out) both` |
| `animate-leave` | `leave 120ms var(--ease-out) both` |
| `animate-fade` | `fade 120ms var(--ease-out) both` |
| `animate-status-fade` | `fade 240ms var(--ease-out) both` |
| `animate-status-ready` | `fade 240ms var(--ease-out) both, leave 240ms var(--ease-out) 2760ms forwards` |
| `animate-pop-in` | `pop-in 120ms var(--ease-out) both` |
| `animate-pop-out` | `pop-out 100ms var(--ease-out) both` |
| `animate-notice` | `notice 2400ms var(--ease-out) both` |
| `animate-expand` | `expand 150ms var(--ease-out) backwards` |
| `animate-collapse` | `collapse 150ms var(--ease-out) both` |
| `animate-row-out` | `slide-out 150ms var(--ease-out) both, row-close 150ms 150ms var(--ease-out) both` |
| `animate-flash` | `flash 900ms var(--ease-out)` |
