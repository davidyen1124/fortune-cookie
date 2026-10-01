# Fortune Cookie

> Tap a fortune cookie. It snaps, the crumbs scatter, and a slightly crumpled slip of paper floats up with your fortune.
> The cookie obeys physics. The paper just does what it's told.

![A fortune cookie snapped in half on a white table, with the slip between the halves](public/social-preview.jpg)

**🥠 Crack one open: <https://fortune-cookie-khaki.vercel.app>**

## What it does

1. A fortune cookie sits on a seamless white studio table. The slip is inside it.
2. Tap it. It snaps across the notch, the way a real one does: the two arms hinge apart, slide a few centimetres and rock to rest, and crumbs spill from the break.
3. The slip, which was wrapped round the notch inside, shows in the broken half, is drawn out, straightens, and comes up to you while the table behind goes softly out of focus. It's a 57 × 16 mm slip in Wonton-Food blue, with lucky numbers on the front and a Learn Chinese lesson on the back. Tap the slip, or press **Turn over**, to read the back.
4. **Another cookie** clears the table and sets down a new one. Fortunes don't repeat until you've read the last 60.

## How it's made

- **The cookie is a real one.** It's a photogrammetry scan: ["Fortune Cookie" by Frank McMains](https://sketchfab.com/3d-models/fortune-cookie-47018f5b63ef477484f5e25debb484df) (about 350 photos, processed in Metashape), used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The copy in `art/scan/` comes from the Objaverse mirror of that model.
- **Blender** ([`blender/build_scan.py`](blender/build_scan.py)) prepares the scan:
  - welds its texture islands into one surface and finds the cookie's own frame from its mirror symmetry (across the arms, shell normal, toward the tips)
  - scales it to life size using the slip in the scan, which comes out about 50 mm across
  - lifts the scanned slip stub off the mesh and closes the shell where it was, so the cookie starts whole with the slip hidden inside
  - cuts the shell into two hollow halves along a chipped line across the notch, four different ways, and gives them a wall thickness and a broken edge
  - exports the meshes (glTF, meshopt-compressed), convex-hull colliders, each piece's mass and inertia (the cookie weighs 8 g), the break lines and where the slip sits
  - [`blender/build_studio.py`](blender/build_studio.py) renders the studio (a white sweep, softboxes) into the HDR light probe the page is lit with.
- **Textures:** the crust is the scan's own photo texture. The broken edge and the paper fibre are macro scans made with the Codex CLI `imagegen` skill (`art/imagegen/`), as are the favicon and social card.
- **Physics:** [Rapier](https://rapier.rs) at 240 Hz. The halves and the crumbs are real rigid bodies with baked-batter friction and bounce, plus a little air drag, since an 8 g shell is mostly air. The snap is an impulse that levers the two arms apart about the back of the cookie. After that it's all simulation.
- **The slip isn't simulated.** It's animated on purpose: hidden inside until the snap, it rides in its half for a beat, slides out toward the gap, and comes up to the reader. It keeps the creases it got in the cookie (faceted folds, a few crinkles, a curl) and is printed like the real thing:
  - condensed bold sans in blue, a register tab, and "Lucky Numbers" with six numbers from 1 to 56 in draw order
  - on the back, a Learn Chinese word in traditional characters with tone-marked pinyin
  - each side faintly shows through the other
- **Fortunes:** 246 of them in [`src/fortunes.js`](src/fortunes.js), written in the house style after reading a few hundred real slips. The 138 Learn Chinese entries were checked against CC-CEDICT.
- **Sound:** no audio files. The crack is a sharp broadband snap followed by a scatter of micro-fractures. Each landing makes a hollow tap, and each crumb a tiny tick, all driven by the physics contact impulses. The slip rustles when it comes out.

## Run it

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # static site in dist/
```

URL flags: `?seed=42` makes every cookie repeatable, `?manual` hands the clock to scripts (`window.__fc.advance(seconds)`), and `?nodof` turns off the depth of field.

Rebuilding the assets needs Blender 5:

```bash
Blender -b -P blender/build_scan.py          # scan -> meshes, colliders, photo texture
Blender -b -P blender/build_studio.py        # studio light probe
./scripts/assets.sh                          # webp + meshopt
```

Tests (Playwright; start `npx vite --port 5288` first):

```bash
node tests/stress.mjs   http://127.0.0.1:5288/ 30   # 30 cracks: nothing falls through the table, everything settles, fortunes stay fresh
node tests/shots.mjs    http://127.0.0.1:5288/      # stage-by-stage screenshots at phone and desktop sizes
node tests/realtime.mjs http://127.0.0.1:5288/ 390x844x3 3 webkit   # real taps, real clock
node tests/video.mjs    http://127.0.0.1:5288/ 390x844x2 5 3        # frame-by-frame video of a crack
```

## Deploying

The Vercel project `fortune-cookie` is connected to this repository: every push to `main` builds with Vite and goes live at <https://fortune-cookie-khaki.vercel.app>. The `.vercelignore` keeps the reference library, renders and Blender files out of CLI uploads.

## Credits

- Cookie model: "Fortune Cookie" by [Frank McMains](https://sketchfab.com/frankmcmains), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modified here: rescaled and re-oriented, simplified, slip removed and the shell closed, cut into halves.
