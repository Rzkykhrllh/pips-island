# Pip's Island

A scroll-driven 3D landing page for a (fictional) indie game. Pip, a little sprout
spirit, runs along a trail across a low-poly island as you scroll: beach, jungle,
a clearing full of breakable crates, a rope bridge over a canyon, and a sunset summit.

Built with Vite, React, React Three Fiber and Three.js. Everything is procedural
for now (no model files), so it loads fast and is easy to tweak.

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
  App.jsx               scroll listener -> world.target (0..1)
  store.js              shared per-frame state + tiny store for the UI
  ui/Overlay.jsx        HTML sections, HUD, waitlist form
  styles.css            trail-sign UI, light/dark tokens
  world/
    terrain.js          heightAt(x, z): the island shape (mountain, canyon, hills)
    track.js            the trail curve + TIMELINE mapping scroll -> trail position
    Director.jsx        smooths scroll, moves Pip along the trail, drives the camera
    Experience.jsx      <Canvas> setup
    Island.jsx          terrain mesh (vertex colours) + animated ocean
    Vegetation.jsx      instanced palms, round trees, pines, rocks (seeded)
    Crates.jsx          breakable crates with sun shards
    Bridge.jsx          rope bridge over the canyon
    Pip.jsx             the character + procedural run / idle / wave / hop
    Atmosphere.jsx      sky gradient, day -> sunset, sun, clouds, shadows
```

The one thing to understand: **scroll progress drives everything.**
`App.jsx` turns `scrollY` into `world.target`; `Director.jsx` damps it into
`world.progress`, maps it through `TIMELINE` (in `track.js`) to a position on the
trail, and places Pip and the camera. Crates break when Pip reaches them and update
the shard counter, which unlocks the feature list in the overlay.

### Tweaking

- **Island shape**: edit `ISLAND` and `heightAt` in `world/terrain.js`.
- **Trail route**: edit the `add(ground(x, z))` points in `world/track.js`.
- **Pacing**: `TIMELINE` in `track.js` and the section `--h` values in
  `ui/Overlay.jsx` work together. If you make a section taller, stretch the
  matching timeline range too.
- **Camera**: offsets and per-section framing in `world/Director.jsx`.
- **Crates**: `CRATE_PROGRESS` in `track.js` (one crate per feature card).

## Next steps

1. Replace Pip with a rigged GLB from Blender (keep the `useFrame` logic in
   `Pip.jsx`; swap the meshes for `useGLTF` + animation actions).
2. Swap primitive trees/rocks for a CC0 low-poly pack (Kenney, Quaternius),
   compressed with `gltf-transform` (Meshopt + KTX2).
3. Wire the waitlist form in `ui/Overlay.jsx` to a real endpoint.
4. Add a loading screen once real assets are in, plus optional sound.
