# Fortune Cookie

> Tap a fortune cookie. It snaps, the crumbs scatter, and a slightly crumpled slip of paper floats up with your fortune.
> The cookie obeys physics. The paper just does what it's told.

![A fortune cookie snapped in half on a white table, with the slip between the halves](public/social-preview.jpg)

## What it does

1. A fresh cookie drops onto a seamless studio table and settles on its own.
2. Tap it. It cracks across the ridge, the way a real one snaps. The two halves fly apart, bounce and rock to a stop, and crumbs spill from the break.
3. The slip slides out of one half, uncreases, and floats up to you. It's a 57 × 16 mm slip in Wonton-Food blue, with lucky numbers on the front and a Learn Chinese lesson on the back. Tap the slip, or press **Turn over**, to read the back.
4. **Another cookie** clears the table and drops a new cookie. Fortunes don't repeat until you've read the last 60.

The dots in the top corner change the backdrop: white paper, lucky red, jade or ink.

## How it's made

- **The cookie is modelled the way it's folded.** A flat disc of batter, 81 mm across, is folded over the slip. Then the middle of the fold is pressed over a cup rim, so both halves of the crease meet and form the slit. Geometrically the half-disc rolls into a cone (the same way a semicircle of paper makes a party hat), with a rounded ridge where it lay on the rim. [`blender/cookie_geom.py`](blender/cookie_geom.py) builds it that way:
  - two layers joined at the crease, with a pocket between them
  - thinner, browner edges
  - lopsided lobes and a wobbly rim
  - every vertex keeps its position on the original flat disc as its UV, so one texture atlas fits the whole cookie *and* every broken piece
- **Blender** ([`blender/build_cookie.py`](blender/build_cookie.py)) triangulates the disc and splits it along jagged break lines into five fracture variants. It solidifies the shell, bakes ambient occlusion in Cycles, and exports:
  - the meshes (glTF, meshopt-compressed)
  - convex-hull colliders and the real mass and inertia of each piece: the cookie weighs 8 g
  - the crease and pocket, where the slip is tucked
  - [`blender/build_studio.py`](blender/build_studio.py) renders the studio (a white sweep, softboxes) into the HDR light probe the page is lit with, plus a Cycles reference render used to calibrate the real-time look.
- **Textures:** the crust, the inside of the pocket, the broken edge and the paper fibre are macro scans made with the Codex CLI `imagegen` skill (`art/imagegen/`). They're made tileable and composited into the atlas with the browning a tray-baked disc gets toward its rim. The favicon and social card were made with `imagegen` too, from the Cycles render.
- **Physics:** [Rapier](https://rapier.rs) at 240 Hz. The halves and 12–18 crumbs are real rigid bodies with baked-batter friction and bounce, plus a little air drag, since an 8 g shell is mostly air. The snap is an impulse that hinges the halves open about the ridge. After that it's all simulation.
- **The slip isn't simulated.** It's animated on purpose. It keeps the creases it got in the cookie (faceted folds, a few crinkles, a curl) and is printed like the real thing:
  - condensed bold sans in blue, a register tab, and "Lucky Numbers" with six numbers from 1 to 56 in draw order
  - on the back, a Learn Chinese word in simplified characters with tone-marked pinyin
  - each side faintly shows through the other
- **Fortunes:** 246 of them in [`src/fortunes.js`](src/fortunes.js), written in the house style after reading a few hundred real slips. The 138 Learn Chinese entries were checked against CC-CEDICT. See `references/` notes for sources (not shipped).
- **Sound:** no audio files. The crack is a sharp broadband snap followed by a scatter of micro-fractures. Each landing makes a hollow tap, and each crumb a tiny tick, all driven by the physics contact impulses. The slip rustles when it comes out.

## Run it

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # static site in dist/
```

URL flags: `?seed=42` makes every cookie repeatable, `?manual` hands the clock to scripts (`window.__fc.advance(seconds)`), and `?lowres` forces the 2k textures.

Rebuilding the assets needs Blender 5:

```bash
Blender -b -P blender/build_cookie.py        # meshes, colliders, textures -> blender/baked, public/assets
Blender -b -P blender/build_studio.py        # studio light probe (-- --ref for the Cycles reference)
./scripts/assets.sh                          # webp + meshopt
```

Tests (Playwright; start `npx vite --port 5288` first):

```bash
node tests/stress.mjs   http://127.0.0.1:5288/ 30   # 30 cracks: nothing falls through the table, everything settles, fortunes stay fresh
node tests/shots.mjs    http://127.0.0.1:5288/      # stage-by-stage screenshots at phone and desktop sizes
node tests/realtime.mjs http://127.0.0.1:5288/ 390x844x3 3 webkit   # real taps, real clock
node tests/video.mjs    http://127.0.0.1:5288/ 390x844x2 5 3        # frame-by-frame video of a crack
```
