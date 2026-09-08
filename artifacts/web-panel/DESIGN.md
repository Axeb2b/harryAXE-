# Parivahan Web Panel — Design Audit

## Identity Lock
Dark-first telemetry dashboard for multi-Firebase device fleet. Indigo primary, teal accent, Outfit / Syne / JetBrains Mono type. shadcn/ui new-york with Radix primitives. Card-based telemetry surfaces with signal dots.

## Tokens
**Color — Dark**
background 228 32% 5%   #070A12
foreground 220 24% 93%  #E9EDF5
primary 244 88% 66%     #6D63FF
accent 192 92% 56%      #16C7F2
card 228 26% 8% / border 228 20% 15%

**Color — Light**
background 210 20% 98%  #F6F8FB
primary 239 84% 60%     #4F46E5
accent 199 89% 48%      #0EA5E9

Radius 0.75rem, typography Outfit sans, Syne display, JetBrains Mono mono.

## Components in use
shadcn/ui new-york: layout, badge, toast, calendar, input, collapsible, resizable, carousel, form, sheet, kbd, toggle, dialog, context-menu, dropdown-menu, switch, drawer, checkbox, input-otp, card, alert-dialog, toaster, menubar, table, command, tooltip, empty, button, textarea

Patterns: page-eyebrow/title, stat-card, sig-dot online/offline/low/danger, text-gradient, brand-mark, nav-chip

## Anti-patterns detected by impeccable
src/index.css line 1: [overused-font] Google Fonts: inter — overused typeface
src/index.css line 203: [gradient-text] background-clip: text + gradient — decorative gradient text

## Routes after cleanup
/ login
/dashboard
/device/:id
/subscriptions [admin]
/profile
/all-sms
/firebases
/otps
/data
/telegram
/user-search
NotFound

APK Studio removed per request.

## Recommendations
1. Replace gradient text with solid color for headings/metrics; keep gradient for brand marks only
2. Consider distinctive type pairing for brand differentiation or keep Inter with custom weight system
3. Document component variants and motion tokens
4. Add visual regression tests for stat-card and sig-dot states
5. Extract token JSON for Figma sync

## Accessibility
Dark mode contrast meets text requirements via CSS variables. Focus rings via --ring. No explicit accessibility mandate confirmed yet.

Last audit: 2026-08-23
