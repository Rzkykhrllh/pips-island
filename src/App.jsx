import { Suspense, lazy, useEffect } from 'react'
import Overlay from './ui/Overlay'
import ErrorBoundary from './ErrorBoundary'
import { uiStore, useUi, world } from './store'
import { CHARACTER } from './sections'
import { enableWalking } from './walk'

function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

// three.js and the island load as a separate chunk, so the page text shows
// first. The runner's chunk (and with it the cat model) starts downloading at
// the same time instead of waiting for the scene chunk to ask for it.
// Without WebGL none of it is fetched: the page works as a plain page.
const WEBGL = hasWebGL()
let Experience = null
if (WEBGL) {
  const scene = import('./world/Experience')
  if (CHARACTER === 'pip') import('./world/Pip')
  else import('./world/Cat')
  Experience = lazy(() => scene)
} else {
  uiStore.set({ noScene: true })
}
const noScene = () => uiStore.set({ noScene: true })

export default function App() {
  useEffect(enableWalking, [])

  useEffect(() => {
    // Page height only changes on resize, so scrolling never forces a layout read
    let max = 1
    const measure = () => {
      max = document.documentElement.scrollHeight - window.innerHeight
      update()
    }
    const update = () => {
      world.target = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
    }
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const setMotion = () => (world.reducedMotion = motion.matches)
    setMotion()
    measure()
    world.progress = world.target // no fly-through when reloading mid-page
    // Coming back from the game with the back button: undo the warp-out
    const shown = (e) => {
      if (!e.persisted) return
      world.leaving = -1
      document.body.classList.remove('warping')
    }
    window.addEventListener('pageshow', shown)
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', measure)
    const resized = new ResizeObserver(measure)
    resized.observe(document.body)
    motion.addEventListener('change', setMotion)
    return () => {
      window.removeEventListener('pageshow', shown)
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', measure)
      resized.disconnect()
      motion.removeEventListener('change', setMotion)
    }
  }, [])

  // Fade the island in once its runner is there, rather than popping in piece by piece
  const ready = useUi((s) => s.ready)
  const failed = useUi((s) => s.noScene)
  useEffect(() => {
    document.body.classList.toggle('scene-ready', ready)
    document.body.classList.toggle('no-scene', failed)
  }, [ready, failed])

  return (
    <>
      {Experience && (
        <ErrorBoundary onError={noScene}>
          <Suspense fallback={null}>
            <Experience />
          </Suspense>
        </ErrorBoundary>
      )}
      <Overlay />
    </>
  )
}
