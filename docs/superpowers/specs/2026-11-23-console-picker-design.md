# Console picker, console matcher, Marvel Rivals poster (2026-11-23)

Approved by the founder in chat on 2026-11-23.

## Why
XQZ Hyderabad's bean-bag PS5 was saved as "PS-5 (Premium bean bags)" (picked "Custom", typed free text) because
the owner model list had no "PS5 Slim". The console matcher does not read "ps-5" as a PS5, so the setup lost its
"Plays GTA 6" chip, GTA 6 seat counting and PS5 specs. Marvel Rivals (XQZ runs it) has no poster.

## 1. Matcher (backend/app/core/fps_estimate.py `_console_for`)
- Normalise `-` and `_` to spaces before whole-word matching: PS-5, PS_5, PS 5, PS5 are one console.
- Tests: each spelling -> ps5; "PS-5 Pro" -> ps5pro; "PS4"/"PS-4" never ps5; XQZ's exact strings run GTA 6.

## 2. Owner console picker (owner onboarding + owner Setups use the same PlatformTierConfigurator)
- Model lists (frontend constants/platforms.ts and backend constants.py PLATFORM_MODELS, kept identical):
  - PlayStation: PS5 Pro, PS5 Slim, PS5, PS4 Pro, PS4 Slim, PS4, Custom
  - Xbox: Series X, Series S, One X, One S, Custom
  - Nintendo: Switch 2, Switch OLED, Switch, Switch Lite, Custom
  - Backend _CONSOLE_LABELS + model-guess keywords gain the new models (slim before base, Switch 2 before Switch).
- Platform choice: larger tiles with icon + label + one-line hint, 2 per row on phones, 5 on desktop.
- Console model: new `ConsoleModelPicker` (radiogroup of photo cards) replaces the `<select>` for
  PlayStation/Xbox/Nintendo. Each card: product photo, name, a short "what it is" line, an info button that opens
  a tip (tap on phones, hover/focus on desktop). Last card "Something else" opens the free-text box (Custom).
  2 cards per row on phones, 3 on desktop. Keyboard: arrow keys move, Enter/Space picks; 44px+ targets.
  PC keeps the existing GPU dropdown.
- Photos: real console photos from Wikimedia Commons (free licences), resized to small WebP in
  public/consoles/<key>.webp with credits in public/consoles/CREDITS.md. Fixed aspect box, lazy, alt text.
- Slim and base report the same console key (ps5 / ps4), so GTA 6 and FPS logic is unchanged.

## 3. Marvel Rivals poster
- public/games/marvelrivals.jpg (official Steam portrait art, founder-licensed like the others) +
  `marvelrivals`, `rivals` keys and a loose match in lib/gameArt.ts.

## Ship
Branch feat/console-picker from main -> tests + `next build` -> dev (qaN) -> real-browser click-through on dev ->
founder runs prod deploy. No migration.
