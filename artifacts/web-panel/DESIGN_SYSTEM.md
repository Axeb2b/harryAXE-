# Parivahan Web Panel — Design System

## Overview
Parivahan Web Panel is a fleet/telemetry dashboard built with React + Vite + Tailwind v4, shadcn/ui (new-york), Radix UI, and Tailwind CSS variables.

Theme is dark-first with light fallback.

## Design Tokens
**Typography**
- Sans: Inter
- Display: Space Grotesk
- Mono: Space Mono

**Radius**
- radius: 0.75rem
- sm/md/lg/xl via css variables

**Colors — Light**
- background: 210 20% 98%  #F6F8FB
- foreground: 222 47% 11%  #0F172A
- primary: 239 84% 60%  #4F46E5 indigo
- accent: 199 89% 48%  #0EA5E9 teal
- success: 142 71% 45%
- warning: 38 92% 50%
- destructive: 0 72% 51%

**Colors — Dark (default)**
- background: 228 32% 5%   #070A12
- foreground: 220 24% 93%  #E9EDF5
- primary: 244 88% 66%  #6D63FF
- accent: 192 92% 56%  #16C7F2
- card: 228 26% 8% / border 228 20% 15%

## Component Library
shadcn/ui new-york style with Radix primitives:
- layout, badge, toast, calendar, input, collapsible, resizable, carousel, form, sheet, kbd, toggle, dialog, context-menu, dropdown-menu, switch, drawer, checkbox, input-otp, card, alert-dialog, toaster, menubar, table, command, tooltip, empty, button, textarea

Utilities: class-variance-authority, clsx, tailwind-merge, tw-animate-css

## Patterns
- page-eyebrow / page-title
- stat-card, sig-dot (online/offline/low/danger)
- text-gradient (primary → accent)
- brand-mark gradient
- nav-chip active/idle

## Accessibility Notes
- Dark mode colors meet contrast for text
- Focus rings via --ring
- Scrollbar styled to theme

## Next steps
- Document component variants
- Extract token JSON for Figma
- Add motion tokens
- Create visual regression tests
