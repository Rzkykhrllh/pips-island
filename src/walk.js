// Walk the cat with the keyboard: arrows or WASD. Forward (→ ↑ D W) heads
// for the summit, back (← ↓ A S) for the beach, Shift to sprint. The keys
// scroll the page, and the scroll moves the cat as always, so the text, the
// camera, the crates and the cat all stay in step. Speed eases in and out,
// like the game's acceleration.

const FORWARD = new Set(['arrowright', 'arrowup', 'd', 'w'])
const BACK = new Set(['arrowleft', 'arrowdown', 'a', 's'])
const held = new Set()
let speed = 0 // px / s, signed
let y = 0 // our own fractional scroll position, so slow speeds don't round to nothing
let last = 0
let raf = 0
let sprint = false

const holding = (keys) => [...held].some((k) => keys.has(k))

function step(now) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  const dir = (holding(FORWARD) ? 1 : 0) - (holding(BACK) ? 1 : 0)
  const top = window.innerHeight * (sprint ? 1.6 : 0.75)
  speed += (dir * top - speed) * (1 - Math.exp(-(dir ? 5 : 9) * dt))

  // Someone scrolled by other means meanwhile: carry on from there
  if (Math.abs(window.scrollY - y) > 2) y = window.scrollY
  const max = document.documentElement.scrollHeight - window.innerHeight
  y = Math.min(max, Math.max(0, y + speed * dt))
  window.scrollTo({ top: y, behavior: 'instant' })

  const stopped = dir === 0 && Math.abs(speed) < 4
  const atEnd = (y <= 0 && speed < 0) || (y >= max && speed > 0)
  if (stopped || (atEnd && dir === 0)) {
    speed = 0
    raf = 0
    return
  }
  raf = requestAnimationFrame(step)
}

function start() {
  if (raf) return
  y = window.scrollY
  last = performance.now()
  raf = requestAnimationFrame(step)
}

const editable = (el) => el?.closest?.('input, textarea, select, [contenteditable]')

function down(e) {
  if (e.ctrlKey || e.metaKey || e.altKey || editable(e.target)) return
  const k = e.key.toLowerCase()
  if (!FORWARD.has(k) && !BACK.has(k)) return
  e.preventDefault() // the arrows would otherwise scroll the page by their own fixed steps
  held.add(k)
  sprint = e.shiftKey
  start()
}
function up(e) {
  held.delete(e.key.toLowerCase())
  sprint = e.shiftKey
}
const clear = () => held.clear()

export function enableWalking() {
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', clear)
  return () => {
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', clear)
    cancelAnimationFrame(raf)
    raf = 0
  }
}
