import { world } from './store'

// Island ambience, synthesised like the game's sound (no audio files):
//  - surf: filtered noise swelling and easing like waves on the beach
//  - wind: thinner noise that picks up as the trail climbs
//  - birds: short chirps, busiest over the jungle, quiet at the summit
// Off until the viewer turns it on (browsers only allow audio after a click).

let ctx = null
let master = null
let surfGain = null
let windGain = null
let timer = 0
let chirpAt = 0

function noiseBuffer(seconds, brown) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1
    // Brown noise (a random walk) is deep and rumbly, white is hissy
    last = brown ? (last + 0.02 * white) / 1.02 : white
    data[i] = brown ? last * 3.5 : white
  }
  return buffer
}

function loop(buffer, filterType, frequency, gain) {
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  const filter = ctx.createBiquadFilter()
  filter.type = filterType
  filter.frequency.value = frequency
  src.connect(filter).connect(gain)
  src.start()
}

function chirp() {
  const t = ctx.currentTime
  const notes = 1 + Math.floor(Math.random() * 3)
  const pitch = 2200 + Math.random() * 1800
  for (let i = 0; i < notes; i++) {
    const at = t + i * 0.12
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(pitch, at)
    osc.frequency.exponentialRampToValueAtTime(pitch * (1.3 + Math.random() * 0.4), at + 0.07)
    env.gain.setValueAtTime(0.0001, at)
    env.gain.exponentialRampToValueAtTime(0.05, at + 0.01)
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.09)
    // Pan each bird somewhere around the listener
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.random() * 1.6 - 0.8
    osc.connect(env).connect(pan).connect(master)
    osc.start(at)
    osc.stop(at + 0.1)
  }
}

// Follow the page: surf strongest on the beach, wind on the heights, birds
// in the jungle
function tick() {
  const p = world.progress
  const t = ctx.currentTime
  const swell = 0.5 + 0.5 * Math.sin(t * 0.55) * Math.sin(t * 0.21 + 1)
  surfGain.gain.setTargetAtTime((0.12 + 0.18 * swell) * (1 - p * 0.6), t, 0.3)
  windGain.gain.setTargetAtTime(0.015 + 0.06 * p * p, t, 0.5)
  const busy = Math.max(0.15, 1 - Math.abs(p - 0.35) * 2.2)
  if (t > chirpAt) {
    chirp()
    chirpAt = t + (1.2 + Math.random() * 3) / busy
  }
}

function start() {
  ctx = new (window.AudioContext || window.webkitAudioContext)()
  master = ctx.createGain()
  master.gain.value = 0
  master.connect(ctx.destination)
  surfGain = ctx.createGain()
  windGain = ctx.createGain()
  surfGain.connect(master)
  windGain.connect(master)
  loop(noiseBuffer(4, true), 'lowpass', 600, surfGain)
  loop(noiseBuffer(3, false), 'bandpass', 900, windGain)
}

export function setAmbience(on) {
  try {
    if (on) {
      if (!ctx) start()
      ctx.resume()
      master.gain.setTargetAtTime(0.8, ctx.currentTime, 0.4)
      clearInterval(timer)
      timer = setInterval(tick, 100)
    } else if (ctx) {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.2)
      clearInterval(timer)
      setTimeout(() => ctx.state === 'running' && master.gain.value < 0.01 && ctx.suspend(), 800)
    }
  } catch {
    // No Web Audio: the page is simply silent
  }
}
