# tools/

Scripts that produce things *from* the game. Nothing here ships, and nothing
here is imported by `src/` — these run against the dev server with Playwright.

## Art export

The game has no image files: every tower is geometry drawn in code. So there is
nothing to extract, only something to re-run at a bigger scale. That is what
these do, which is why the output is sharp at any size rather than an upscale
of what is on screen.

```bash
npm run dev                       # in one terminal
node tools/export-tower-art.js    # 17 towers x 4 tiers x 2 framings -> towerart/
LEVEL=4 node tools/export-tower-sheet.js   # a labelled contact sheet
```

`TILE=2048 node tools/export-tower-art.js` for print. `OUT=somewhere` to
change the directory.

Store-page assets, key art and press kits all come from here rather than from
screenshots — a screenshot is capped at the display resolution, and these are
not.
