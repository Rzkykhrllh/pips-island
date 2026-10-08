import { nudgeCamera, resetCamera, useUi } from '../store'
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

function jumpTo(p) {
  const max = document.documentElement.scrollHeight - window.innerHeight
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: p * max, behavior: smooth ? 'smooth' : 'auto' })
}

function Hud() {
  const crates = useUi((s) => s.crates)
  return (
    <>
      <a className="hud-logo" href="#top" onClick={(e) => (e.preventDefault(), jumpTo(0))}>
        N. Usantara
      </a>
      <div className="hud-crates" aria-live="polite">
        <span className="crate-icon" aria-hidden="true" />
        <span>
          {crates} / {FEATURES.length}
          <span className="visually-hidden"> crates broken</span>
        </span>
      </div>
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

// Buttons for the same moves as drag and pinch, for keyboards and anyone who
// doesn't think to drag the island
function CameraButtons() {
  const orbited = useUi((s) => s.orbited)
  const ready = useUi((s) => s.ready)
  if (!ready) return null
  const turn = Math.PI / 6
  return (
    <div className="hud-camera" role="group" aria-label="Camera">
      <button type="button" onClick={() => nudgeCamera({ yaw: turn })} aria-label="Turn camera left">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 7H4V3M4.6 7a9 9 0 1 1-.9 7" />
        </svg>
      </button>
      <button type="button" onClick={() => nudgeCamera({ yaw: -turn })} aria-label="Turn camera right">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M16 7h4V3M19.4 7a9 9 0 1 0 .9 7" />
        </svg>
      </button>
      <button type="button" onClick={() => nudgeCamera({ zoom: 0.8 })} aria-label="Zoom in">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <button type="button" onClick={() => nudgeCamera({ zoom: 1.25 })} aria-label="Zoom out">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
      </button>
      {orbited && (
        <button type="button" className="reset" onClick={resetCamera}>
          Reset view
        </button>
      )}
    </div>
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
            <a className="play" href={GAME_URL}>
              Play now
            </a>
            <Loading />
            <span className="scroll-cue" aria-hidden="true" />
            <p className="hero-hint">Scroll to follow the cat · drag the island to look around</p>
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
              <p className="muted">It runs as fast as you scroll. Scroll back and it turns around.</p>
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
              <a className="play" href={GAME_URL}>
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
