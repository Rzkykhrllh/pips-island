import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { nudgeCamera, resetCamera } from '../store'

// Let the viewer look around without breaking the page's scroll:
//  - drag with a mouse: swing round (left/right) and tilt (up/down)
//  - drag with one finger: swing round; vertical swipes still scroll the page
//  - pinch, or ctrl + wheel (also what a trackpad pinch sends): zoom
//  - plain wheel: scrolls the page as usual
//  - Q / E: turn left / right
//  - double-click: back to the director's shot
export default function CameraControls() {
  const el = useThree((s) => s.gl.domElement)

  useEffect(() => {
    const pointers = new Map()
    let pinch = 0

    const spread = () => {
      const [a, b] = [...pointers.values()]
      return Math.hypot(a.x - b.x, a.y - b.y)
    }
    const down = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      el.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 2) pinch = spread()
      el.classList.add('dragging')
    }
    const move = (e) => {
      const p = pointers.get(e.pointerId)
      if (!p) return
      const dx = e.clientX - p.x
      const dy = e.clientY - p.y
      p.x = e.clientX
      p.y = e.clientY
      if (pointers.size === 2) {
        const d = spread()
        if (pinch > 0 && d > 0) nudgeCamera({ zoom: pinch / d })
        pinch = d
      } else if (pointers.size === 1) {
        // Scale by the canvas width so a full-width drag is about one turn
        const turn = (Math.PI * 2) / Math.max(600, el.clientWidth)
        nudgeCamera({ yaw: -dx * turn, pitch: e.pointerType === 'mouse' ? dy * turn * 0.6 : 0 })
      }
    }
    const up = (e) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinch = 0
      if (pointers.size === 0) el.classList.remove('dragging')
    }
    const wheel = (e) => {
      if (!e.ctrlKey) return // plain wheel scrolls the page
      e.preventDefault()
      nudgeCamera({ zoom: Math.exp(e.deltaY * 0.01) })
    }

    const key = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea, select')) return
      const k = e.key.toLowerCase()
      if (k === 'q') nudgeCamera({ yaw: Math.PI / 8 })
      else if (k === 'e') nudgeCamera({ yaw: -Math.PI / 8 })
    }
    window.addEventListener('keydown', key)
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('dblclick', resetCamera)
    return () => {
      window.removeEventListener('keydown', key)
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('dblclick', resetCamera)
    }
  }, [el])

  return null
}
