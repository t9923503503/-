# Legacy KOTC: Inline Handler Rules

This legacy app still renders a lot of UI through HTML strings with inline handlers like `onclick`, `oninput`, `onchange`, and `onblur`.

## Why buttons break

`web/public/kotc/index.html` uses a CSP that blocks native inline handlers.
Because of that, legacy controls only work through the delegated bridge in `web/public/kotc/assets/js/main.js`.

## Rules for future changes

1. If you add new legacy controls with inline attributes, keep using only `onclick`, `oninput`, `onchange`, or `onblur`.
2. Do not remove or bypass `installInlineEventBridge()` from `web/public/kotc/assets/js/main.js`.
3. Prefer plain handler expressions that can run with `this` and `event`, for example:
   `onclick="applyRoster()"`
   `oninput="rosterAcShow(this)"`
   `onclick="event.stopPropagation();deleteHistory(42)"`
4. For new non-legacy code, prefer `addEventListener` instead of inline handlers.
5. After changing roster markup, always verify:
   `/sudyam` opens on `roster`
   roster buttons react to click
   search inputs react to typing
   checkbox/toggle controls react to change

## If roster buttons stop working again

Check these files first:

- `web/public/kotc/assets/js/main.js`
- `web/public/kotc/index.html`
- `web/public/kotc/assets/js/screens/roster.js`
