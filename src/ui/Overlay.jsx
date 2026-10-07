import { useState } from 'react'
import { useUi } from '../store'

// Section heights (in viewport heights) are tuned to world/track.js TIMELINE.
// If you change one, nudge the other so text and island stay in sync.

const FEATURES = [
  { title: 'Hand-built islands', body: 'Every island is laid out by hand, so every path leads somewhere worth going.' },
  { title: 'Bouncy, readable jumps', body: 'Pip always lands where you expect. Mistakes are yours, never the camera’s.' },
  { title: 'Secrets in every corner', body: 'Crates, caves and hidden ledges. Some shards only show up at sunset.' },
  { title: 'Plays in your browser', body: 'No install, no launcher. Open a link and you’re on the beach.' },
]

const ROADMAP = [
  { when: 'Now', what: 'Playable prototype: one island and one very determined sprout.' },
  { when: 'Spring 2027', what: 'Free browser demo with the first three islands.' },
  { when: 'Late 2027', what: 'Chapter one: eight islands, a boss fight, and far more crates.' },
]

const STOPS = [
  { label: 'Beach', p: 0 },
  { label: 'Jungle', p: 0.17 },
  { label: 'Crates', p: 0.36 },
  { label: 'Bridge', p: 0.72 },
  { label: 'Summit', p: 1 },
]

function jumpTo(p) {
  const max = document.documentElement.scrollHeight - window.innerHeight
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: p * max, behavior: smooth ? 'smooth' : 'auto' })
}

function Hud() {
  const shards = useUi((s) => s.shards)
  return (
    <>
      <a className="hud-logo" href="#top" onClick={(e) => (e.preventDefault(), jumpTo(0))}>
        Pip’s Island
      </a>
      <div className="hud-shards" aria-live="polite">
        <span className="shard-icon" aria-hidden="true" />
        <span>
          {shards} / {FEATURES.length}
          <span className="visually-hidden"> sun shards found</span>
        </span>
      </div>
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

function Waitlist() {
  const [email, setEmail] = useState('')
  const [joined, setJoined] = useState(false)

  const submit = (e) => {
    e.preventDefault()
    // TODO: send `email` to your backend or a waitlist service.
    setJoined(true)
  }

  if (joined) {
    return (
      <p className="joined" role="status">
        You’re on the waitlist. We’ll send one email when the demo is ready.
      </p>
    )
  }

  return (
    <form className="waitlist" onSubmit={submit}>
      <label htmlFor="email" className="visually-hidden">
        Email address
      </label>
      <input
        id="email"
        type="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
      />
      <button type="submit">Join the waitlist</button>
    </form>
  )
}

export default function Overlay() {
  const shards = useUi((s) => s.shards)

  return (
    <>
      <Hud />
      <main id="top" className="overlay">
        <section className="sec sec-hero" style={{ '--h': 100 }}>
          <div className="hero">
            <p className="hero-kicker">Pip Studio presents</p>
            <h1 className="hero-title">
              <span>Pip’s</span> <span>Island</span>
            </h1>
            <p className="hero-sub">A tiny sprout spirit and one very big island. Scroll to follow Pip to the top.</p>
            <span className="scroll-cue" aria-hidden="true" />
          </div>
        </section>

        <section className="sec" style={{ '--h': 150 }}>
          <div className="pin pin-left">
            <article className="sign">
              <h2>This is Pip.</h2>
              <p>
                Pip woke up on the beach this morning with sand in his leaves and no idea how he got here. The only way
                to find out is up: through the jungle, over the canyon, all the way to the summit.
              </p>
              <p className="muted">He runs as fast as you scroll. Scroll back and he’ll turn around.</p>
            </article>
          </div>
        </section>

        <section className="sec" style={{ '--h': 250 }}>
          <div className="pin pin-right">
            <article className="sign">
              <h2>Break crates, find shards</h2>
              <p>
                Every crate on the trail hides a sun shard. Pip has found {shards} of {FEATURES.length} so far.
              </p>
              <ul className="features">
                {FEATURES.map((f, i) => {
                  const found = i < shards
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
              <h2>The road ahead</h2>
              <ol className="roadmap">
                {ROADMAP.map((r) => (
                  <li key={r.when}>
                    <span className="when">{r.when}</span>
                    <span>{r.what}</span>
                  </li>
                ))}
              </ol>
              <p className="muted">Dates are targets, not promises. Pip is still learning to jump.</p>
            </article>
          </div>
        </section>

        <section className="sec" style={{ '--h': 100 }} aria-hidden="true" />

        <section className="sec sec-summit" style={{ '--h': 100 }}>
          <div className="summit">
            <h2>You made it to the top.</h2>
            <p>Get one email when the demo is ready to play. Nothing else.</p>
            <Waitlist />
            <footer>© 2026 Pip Studio</footer>
          </div>
        </section>
      </main>
    </>
  )
}
