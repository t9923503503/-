# DEPRECATED: Legacy KOTC

This directory contains the legacy KOTC (King of the Court) application that was used
for iframe embedding via the Next.js web app.

**The standalone replacement is at `formats/kotc/`** (kotc.html, kotc.js, kotc-format.js, kotc.css).

This legacy copy:
- Has diverged CSS (2781 vs 2789 lines in main app.css)
- Contains ~11,000 lines across 33 files
- Is replaced by ~2,700 lines in `formats/kotc/` using shared modules

**Do not modify files in this directory.** All new KOTC work should go to `formats/kotc/`.

This directory will be removed once the Next.js web app is updated to reference `formats/kotc/` directly.
