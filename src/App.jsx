import { useEffect } from 'react'
import Experience from './world/Experience'
import Overlay from './ui/Overlay'
import { world } from './store'

export default function App() {
  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      world.target = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
    }
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const setMotion = () => (world.reducedMotion = motion.matches)
    setMotion()
    update()
    world.progress = world.target // no fly-through when reloading mid-page
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    motion.addEventListener('change', setMotion)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      motion.removeEventListener('change', setMotion)
    }
  }, [])

  return (
    <>
      <Experience />
      <Overlay />
    </>
  )
}
