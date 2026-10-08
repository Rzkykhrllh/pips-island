# N. Usantara Island: landing page

A scroll-driven 3D landing page for [N. Usantara Island](https://game.byairu.com/island),
the playable portfolio in `web-3d-project`. As you scroll, Airu's cat runs a trail
across a world-map style island: beach, jungle, a clearing full of crates, a rope
bridge over the gorge, and a summit ringed by rock spires at sunset.

Built with Vite, React, React Three Fiber and Three.js. It shares the game's look:
toon shading with the same three-band ramp, outlines on the cat and crates, the
same crate texture, palette and fonts (Lilita One, Nunito). The runner is the
game's rigged cat (`src/assets/cat.glb`, Mixamo clips); everything else is
procedural. Add `?char=pip` to the URL for the old procedural sprout, and
`?quality=low|medium|high` to pin a graphics tier.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # static site in dist/
npm run build:single # everything inlined into one dist/index.html
```

`dist/` is plain static files, so it deploys anywhere (Vercel, Netlify, Cloudflare
Pages, or an nginx container on your own server).

## How it works

```
src/
  App.jsx               scroll listener -> world.target (0..1); lazy-loads the 3D scene
  store.js              shared per-frame state + tiny store for the UI (no three.js)
  sections.js           page sections / trail stops (no three.js)
  ui/Overlay.jsx        HTML sections, HUD, Play buttons
  styles.css            trail-sign UI, game palette, light/dark tokens
  world/
    terrain.js          heightAt(x, z): ragged coastline, massif, gorge
    track.js            the trail curve + TIMELINE mapping scroll -> trail position
    layout.js           where the spires, waterfall, lava, village and totem sit
    Director.jsx        smooths scroll, moves the runner along the trail, per-section camera shots
    CameraControls.jsx  drag to orbit, pinch / ctrl+wheel to zoom, double-click to reset
    Experience.jsx      <Canvas> setup, graphics tiers, lazy runner
    quality.js          low / medium / high tiers + automatic step-down on low FPS
    toon.js             shared toon ramp and outline material
    Island.jsx          terrain mesh (vertex colours) + ocean with shallow/deep colours
    Landmarks.jsx       rock spires, tiki face, waterfall, lava, huts, palisade, dashed trail path
    Baked.jsx           folds static JSX props into one mesh (one draw call)
    Vegetation.jsx      instanced palms, broadleaf trees, bushes, pink plants, rocks (seeded)
    Crates.jsx          breakable crates with fruit
    Bridge.jsx          rope bridge over the gorge
    Cat.jsx             the default runner: rigged GLB, idle / walk / run / victory, spins through crates
    Pip.jsx             the procedural sprout (?char=pip)
    Atmosphere.jsx      keyed lighting (morning -> sunset), sky, fill light, sun halo, clouds, shadows
```

Camera: the scroll drives a cinematic shot per section, and the viewer can
orbit on top of it: drag the island (sideways only on touch, so vertical swipes
still scroll), pinch or ctrl+wheel to zoom, the round buttons bottom-right, or
double-click to reset. Plain wheel scrolling always scrolls the page.

Performance notes: static props are baked into single meshes, trees, clouds and
puffs are instanced, the cat model is simplified to ~18k triangles for the page,
the ocean grid is dense only near the island, and three.js / React ship as
separate long-cached chunks loaded in parallel with the runner's model.

The one thing to understand: **scroll progress drives everything.**
`App.jsx` turns `scrollY` into `world.target`; `Director.jsx` damps it into
`world.progress`, maps it through `TIMELINE` (in `track.js`) to a position on the
trail, and places Pip and the camera. Crates break when Pip reaches them and update
the crate counter, which unlocks the feature list in the overlay.

### Tweaking

- **Island shape**: edit `ISLAND`, `shoreRadius` and `heightAt` in `world/terrain.js`.
- **Landmarks**: positions in `world/layout.js` (trees keep clear of them automatically).
- **Trail route**: edit the `add(ground(x, z))` points in `world/track.js`.
- **Pacing**: `TIMELINE` in `track.js` and the section `--h` values in
  `ui/Overlay.jsx` work together. If you make a section taller, stretch the
  matching timeline range too.
- **Camera**: offsets and per-section framing in `world/Director.jsx`.
- **Crates**: `CRATE_PROGRESS` in `track.js` (one crate per feature card).

## Next steps

1. An `og:image` screenshot (1200x630) for link previews.
2. Swap primitive trees/rocks for a CC0 low-poly pack (Kenney, Quaternius),
   compressed with `gltf-transform` (Meshopt + KTX2).
3. Sound, matching the game's music once it has real tracks.
