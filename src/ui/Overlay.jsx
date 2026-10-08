import { useEffect, useState } from 'react'
import { nudgeCamera, resetCamera, uiStore, useUi, world } from '../store'
import { setAmbience } from '../audio'
import { STOPS } from '../sections'

// Landing page for N. Usantara Island, the playable portfolio in web-3d-project.
// Section heights (in viewport heights) are tuned to world/track.js TIMELINE.
// If you change one, nudge the other so text and island stay in sync.

const GAME_URL = 'https://game.byairu.com/island'
const PORTFOLIO_URL = 'https://dev.byairu.com'

const FEATURES = [
  {
    title: 'Crates with a temper',
    body: 'TNT lights a three-second fuse, Nitro goes off at a touch, bounce crates fling you skyward.',
  },
  { title: 'Crabs on patrol', body: 'Stomp them or spin straight through them. They will not apologise either way.' },
  {
    title: 'A temple full of fire',
    body: 'Rolling logs, fire jets on a beat and a lift to the top of the temple, where the green gem waits.',
  },
  { title: 'Plays anywhere', body: 'Keyboard or a thumb stick, right in the browser. The graphics adapt to your device.' },
]

const NEXT = [
  { when: 'Now', what: 'One full level: jungle, chasms, the Fire Temple and a warp pad at the end.' },
  { when: 'Next', what: 'A tiki mask that takes a hit for you, and a boulder chase with the camera turned around.' },
  { when: 'Later', what: 'A warp room with short levels for projects, experience and skills, plus time trials.' },
]

// Play: the cat warps out in a beam of light, the screen flares white, and
// the game opens. A modified click (new tab and so on) works as a plain link.
function warpToGame(e) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  if (!uiStore.get().ready || world.reducedMotion || world.leaving >= 0) return
  e.preventDefault()
  world.leaving = 0
  document.body.classList.add('warping')
  setTimeout(() => window.location.assign(GAME_URL), 1100)
}

function jumpTo(p) {
  const max = document.documentElement.scrollHeight - window.innerHeight
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: p * max, behavior: smooth ? 'smooth' : 'auto' })
}

function Hud() {
  const crates = useUi((s) => s.crates)
  const fruit = useUi((s) => s.fruit)
  const found = useUi((s) => s.bonusFound)
  const total = useUi((s) => s.bonusTotal)
  return (
    <>
      <a className="hud-logo" href="#top" onClick={(e) => (e.preventDefault(), jumpTo(0))}>
        N. Usantara
      </a>
      <div className="hud-crates">
        <span className="stat" title="Fruit">
          {/* Re-keyed so the icon pops each time the count goes up */}
          <span key={fruit} className={`fruit-icon${fruit ? ' pop' : ''}`} aria-hidden="true" />
          {fruit}
          <span className="visually-hidden"> fruit</span>
        </span>
        <span className="stat" title="Crates on the trail">
          <span className="crate-icon" aria-hidden="true" />
          {crates} / {FEATURES.length}
          <span className="visually-hidden"> trail crates broken</span>
        </span>
        {total > 0 && (
          <span className="stat" title="Hidden crates">
            <span className="crate-icon bonus" aria-hidden="true">
              ?
            </span>
            {found} / {total}
            <span className="visually-hidden"> hidden crates found</span>
          </span>
        )}
      </div>
      <Toast />
      <CameraButtons />
      <nav className="hud-trail" aria-label="Jump along the trail">
        {STOPS.map((s) => (
          <button key={s.label} type="button" onClick={() => jumpTo(s.p)}>
            <span className="dot" aria-hidden="true" />
            <span className="label">{s.label}</span>
          </button>
        ))}
      </nav>
    </>
  )
}

// Short messages (a hidden crate found), one at a time
function Toast() {
  const t = useUi((s) => s.toast)
  const [shown, setShown] = useState(null)
  useEffect(() => {
    if (!t) return
    setShown(t)
    const id = setTimeout(() => setShown(null), 2800)
    return () => clearTimeout(id)
  }, [t])
  return (
    <div className="toast" role="status" aria-live="polite">
      {shown && (
        <span key={shown.id} className="toast-body">
          {shown.text}
        </span>
      )}
    </div>
  )
}

// Ambient sound: off until asked for (browsers block audio before a click),
// and quiet while the tab is hidden
function SoundButton() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    setAmbience(on)
    const hidden = () => setAmbience(on && !document.hidden)
    document.addEventListener('visibilitychange', hidden)
    return () => document.removeEventListener('visibilitychange', hidden)
  }, [on])
  return (
    <button type="button" onClick={() => setOn(!on)} aria-pressed={on} aria-label={on ? 'Mute island sounds' : 'Play island sounds'}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" />
        {on ? <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /> : <path d="M17 9l5 6M22 9l-5 6" />}
      </svg>
    </button>
  )
}

// Buttons for the same moves as drag and pinch, for keyboards and anyone who
// doesn't think to drag the island
// Every way to play, in one card behind the "?" button
const CONTROLS = [
  ['Scroll, swipe, ← → or A D', 'Follow the trail (Shift runs)'],
  ['Click the cat, K or X', 'Spin'],
  ['J', 'Jump'],
  ['Click or tap a crate', 'Smash it. Six hidden "?" crates are out there'],
  ['Drag the island, Q E', 'Look around'],
  ['Pinch, Ctrl + scroll, + −', 'Zoom'],
  ['Double-click', 'Back to the default view'],
]

function ControlsCard({ onClose }) {
  useEffect(() => {
    const key = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <div className="controls-card" role="dialog" aria-label="How to play">
      <h2>How to play</h2>
      <dl>
        {CONTROLS.map(([keys, what]) => (
          <div key={keys}>
            <dt>{keys}</dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
      <button type="button" className="plain" onClick={onClose}>
        Got it
      </button>
    </div>
  )
}

// Sound, zoom, how-to-play and (once the view has moved) reset. Turning is
// drag or Q / E, so it doesn't need buttons of its own.
function CameraButtons() {
  const orbited = useUi((s) => s.orbited)
  const ready = useUi((s) => s.ready)
  const [help, setHelp] = useState(false)
  if (!ready) return null
  return (
    <>
      {help && <ControlsCard onClose={() => setHelp(false)} />}
      <div className="hud-camera" role="group" aria-label="Camera and sound">
        {orbited && (
          <button type="button" className="reset" onClick={resetCamera}>
            Reset view
          </button>
        )}
        <SoundButton />
        <button type="button" onClick={() => nudgeCamera({ zoom: 1.25 })} className="cam-move" aria-label="Zoom out">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14" />
          </svg>
        </button>
        <button type="button" onClick={() => nudgeCamera({ zoom: 0.8 })} className="cam-move" aria-label="Zoom in">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <button type="button" className="help" onClick={() => setHelp(!help)} aria-expanded={help} aria-label="How to play">
          ?
        </button>
      </div>
    </>
  )
}

function Loading() {
  const ready = useUi((s) => s.ready)
  const noScene = useUi((s) => s.noScene)
  if (noScene) return null
  return (
    <p className={`loading${ready ? ' done' : ''}`} role="status">
      <span className="crate-spin" aria-hidden="true" />
      {ready ? 'The island is ready' : 'Loading the island…'}
    </p>
  )
}

export default function Overlay() {
  const crates = useUi((s) => s.crates)

  return (
    <>
      <Hud />
      <main id="top" className="overlay">
        <section className="sec sec-hero" style={{ '--h': 100 }}>
          <div className="hero">
            <p className="hero-kicker">A playable portfolio by Airu</p>
            <h1 className="hero-title">
              <span>N. Usantara</span> <span>Island</span>
            </h1>
            <p className="hero-sub">Smash crates. Find my work. Watch out for TNT.</p>
            <a className="play" href={GAME_URL} onClick={warpToGame}>
              Play now
            </a>
            <Loading />
            <p className="hero-hint">
              Scroll<span className="keys"> or use ← →</span> to explore · click crates to smash them
            </p>
            <span className="scroll-cue" aria-hidden="true" />
          </div>
        </section>

        <section className="sec" style={{ '--h': 150 }}>
          <div className="pin pin-left">
            <article className="sign">
              <h2>Meet the cat.</h2>
              <p>
                Red Hawaiian shirt, a gold ring with a green gem, sandals, and somewhere to be. Straight up the island:
                through the jungle, over the gorge, all the way to the summit.
              </p>
              <p className="muted">
                It runs as fast as you scroll, or walk it with the arrow keys or WASD. Go back and it turns around.
              </p>
            </article>
          </div>
        </section>

        <section className="sec" style={{ '--h': 250 }}>
          <div className="pin pin-right">
            <article className="sign">
              <h2>Smash every crate</h2>
              <p>
                In the game, every crate holds fruit and some hold a piece of my work. Here, each one opens a feature.
                Broken so far: {crates} of {FEATURES.length}.
              </p>
              <ul className="features">
                {FEATURES.map((f, i) => {
                  const found = i < crates
                  return (
                    <li key={f.title} className={found ? 'found' : 'locked'}>
                      <span className="feature-icon" aria-hidden="true" />
                      <div>
                        <h3>{found ? f.title : 'Still in a crate'}</h3>
                        <p>{found ? f.body : 'Keep scrolling to break it open.'}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </article>
          </div>
        </section>

        <section className="sec" style={{ '--h': 150 }}>
          <div className="pin pin-left">
            <article className="sign">
              <h2>Coming to the island</h2>
              <ol className="roadmap">
                {NEXT.map((r) => (
                  <li key={r.when}>
                    <span className="when">{r.when}</span>
                    <span>{r.what}</span>
                  </li>
                ))}
              </ol>
              <p className="muted">Built from scratch with Three.js, one crate at a time.</p>
            </article>
          </div>
        </section>

        <section className="sec" style={{ '--h': 100 }} aria-hidden="true" />

        <section className="sec sec-summit" style={{ '--h': 100 }}>
          <div className="summit">
            <h2>You made it to the top.</h2>
            <p>The real island is waiting. Bring a keyboard or a thumb.</p>
            <div className="summit-actions">
              <a className="play" href={GAME_URL} onClick={warpToGame}>
                Play N. Usantara Island
              </a>
              <a className="plain" href={PORTFOLIO_URL} target="_blank" rel="noopener">
                Engineering portfolio ↗
              </a>
            </div>
            <footer>Made by Airu · Software Engineer, Tokyo</footer>
          </div>
        </section>
      </main>
    </>
  )
}
