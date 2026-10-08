// Page sections as scroll progress: the HUD buttons and the red stops on the
// trail. Kept free of three.js so the page can render before the 3D loads.
export const STOPS = [
  { label: 'Beach', p: 0 },
  { label: 'Jungle', p: 0.17 },
  { label: 'Crates', p: 0.36 },
  { label: 'Bridge', p: 0.72 },
  { label: 'Summit', p: 1 },
]

// The runner: the rigged cat by default, `?char=pip` for the procedural sprout
export const CHARACTER = new URLSearchParams(window.location.search).get('char') === 'pip' ? 'pip' : 'cat'
