// Graphics tiers, same idea as the game (web-3d-project/src/quality.js):
// start from a guess based on the device, then step down if the frame rate
// stays low. ?quality=low|medium|high in the URL pins a tier.

export const TIERS = {
  low: { dpr: 1, shadows: false, shadowMap: 1024 },
  medium: { dpr: 1.25, shadows: true, shadowMap: 1024 },
  high: { dpr: 1.5, shadows: true, shadowMap: 2048 }, // past 1.5 the extra pixels cost more than they show
}
export const ORDER = ['low', 'medium', 'high']

const pinned = new URLSearchParams(window.location.search).get('quality')
export const PINNED = ORDER.includes(pinned) ? pinned : null

export function guessTier() {
  if (PINNED) return PINNED
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const cores = navigator.hardwareConcurrency || 4
  if (coarse) return cores >= 8 ? 'medium' : 'low'
  return cores >= 8 ? 'high' : 'medium'
}

// Watches frame times; returns true once the scene has been slow for a few
// seconds in a row and should step down a tier
export function createFpsWatch() {
  let acc = 0
  let frames = 0
  let slow = 0
  return (rawDt) => {
    // A long frame means the tab was hidden or throttled, not that the scene is slow
    if (document.hidden || rawDt > 0.2) {
      acc = frames = slow = 0
      return false
    }
    acc += rawDt
    frames++
    if (acc < 1) return false
    const fps = frames / acc
    acc = frames = 0
    slow = fps < 40 ? slow + 1 : 0
    if (slow < 4) return false
    slow = 0
    return true
  }
}
