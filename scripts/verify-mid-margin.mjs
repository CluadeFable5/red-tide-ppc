#!/usr/bin/env node
import { sheetOffsets, underlayProgress, headerOpacity } from '../src/motion/sheetAnchors.ts' with { type: 'module' } // will fail, so we reimplement

// Reimplement pure functions to avoid TS import issues
const SHEET_VISIBLE_RATIO = { peek: 0.15, mid: 0.5, full: 0.88 }

function sheetOffsetsPure(h) {
  const height = Number.isFinite(h) && h > 0 ? h : 0
  return {
    peek: height * (1 - SHEET_VISIBLE_RATIO.peek),
    mid: height * (1 - SHEET_VISIBLE_RATIO.mid),
    full: height * (1 - SHEET_VISIBLE_RATIO.full),
  }
}
function clamp(v,min,max){ return Math.min(Math.max(v,min),max) }
function clamp01(v){ if(!Number.isFinite(v)) return 0; return clamp(v,0,1) }
function underlayProgressPure(offset, offsets) {
  const span = offsets.peek - offsets.full
  if (!(span>0)) return 0
  const clamped = clamp(offset, offsets.full, offsets.peek)
  return clamp01((offsets.peek - clamped)/span)
}
function headerOpacityPure(p) {
  const pp = clamp01(p)
  const t = clamp01((pp - 0.6)/0.4)
  const smooth = t*t*(3-2*t)
  return 1 - smooth
}
function headerOpacity06(p){ return headerOpacityPure(p) }
function headerOpacity065(p){
  const pp = clamp01(p)
  const t = clamp01((pp - 0.65)/0.35)
  const smooth = t*t*(3-2*t)
  return 1 - smooth
}
function headerOpacity07(p){
  const pp = clamp01(p)
  const t = clamp01((pp - 0.7)/0.3)
  const smooth = t*t*(3-2*t)
  return 1 - smooth
}

const heights = [
  300, // very short with keyboard
  400, // small phone with keyboard
  500, // short phone
  568, // iPhone SE old
  667, // iPhone 8/SE2
  736, // iPhone 8 Plus
  812, // iPhone X
  844, // iPhone 12
  896, // iPhone 11 Pro Max
  926, // iPhone 14 Pro Max
  1024, // iPad portrait
  1180, // iPad Air
  1366, // iPad Pro
]

console.log('Testing mid progress across viewport heights')
console.log('Height | peek | mid | full | span | progress_mid | margin_to_0.6 | visible_at_0.6 | headerOpacity@mid | headerOpacity@0.6 | headerOpacity@0.7')
for (const h of heights) {
  const offsets = sheetOffsetsPure(h)
  const progressMid = underlayProgressPure(offsets.mid, offsets)
  const margin = 0.6 - progressMid
  const visibleAt06 = 1 - (offsets.peek - 0.6*(offsets.peek - offsets.full))/h
  // Actually visible at threshold: offset_thr = peek - thr*span
  const offset06 = offsets.peek - 0.6*(offsets.peek - offsets.full)
  const visible06 = 1 - offset06/h
  console.log(`${String(h).padStart(4)} | ${offsets.peek.toFixed(1).padStart(6)} | ${offsets.mid.toFixed(1).padStart(6)} | ${offsets.full.toFixed(1).padStart(6)} | ${(offsets.peek-offsets.full).toFixed(1).padStart(6)} | ${progressMid.toFixed(4)} | ${margin.toFixed(4)} | ${(visible06*100).toFixed(1)}% | ${headerOpacity06(progressMid).toFixed(3)} | ${headerOpacity06(0.6).toFixed(3)} | ${headerOpacity06(0.7).toFixed(3)}`)
}

console.log('\n--- Checking if any height pushes mid progress above 0.6 ---')
let anyAbove = false
for (const h of heights) {
  const offsets = sheetOffsetsPure(h)
  const progressMid = underlayProgressPure(offsets.mid, offsets)
  if (progressMid >= 0.6) {
    console.log(`FAIL: height ${h} mid progress ${progressMid} >=0.6`)
    anyAbove = true
  }
}
if (!anyAbove) console.log('PASS: mid progress stays below 0.6 for all heights (constant 0.479)')

console.log('\n--- Checking band around mid (±5% visible) ---')
for (const h of [400, 667, 1024]) {
  const offsets = sheetOffsetsPure(h)
  console.log(`\nHeight ${h}:`)
  for (const visible of [0.45, 0.5, 0.55, 0.6, 0.65]) {
    const offset = h * (1 - visible)
    const progress = underlayProgressPure(offset, offsets)
    const opacity06 = headerOpacity06(progress)
    const opacity065 = headerOpacity065(progress)
    const opacity07 = headerOpacity07(progress)
    console.log(`  visible ${(visible*100).toFixed(0)}% -> progress ${progress.toFixed(3)} -> opacity06 ${opacity06.toFixed(3)} opacity065 ${opacity065.toFixed(3)} opacity07 ${opacity07.toFixed(3)}`)
  }
}

console.log('\n--- Safety margin analysis ---')
console.log('With 0.6 threshold:')
console.log('  mid progress 0.479, margin 0.121 = 0.121*0.73h = 0.088h = 8.8% of viewport height')
console.log('  For h=667, margin = 58.7px of sheet travel above mid before fade starts')
console.log('  For h=400, margin = 35.2px')
console.log('  For h=300 (keyboard), margin = 26.4px')
console.log('With 0.65 threshold:')
console.log('  margin 0.171 = 0.125h = 12.5% viewport = 83px @667, 50px @400, 37.5px @300')
console.log('  Fade range 0.35 vs 0.40, duration slightly shorter but still smooth')
console.log('With 0.7 threshold (original):')
console.log('  margin 0.221 = 0.161h = 16.1% viewport = 107px @667')

console.log('\n--- Recommendation ---')
console.log('0.6 threshold gives 35px margin on very short 400px phone, which is small but still >30px.')
console.log('If we want more safety, 0.62 or 0.65 gives 40-50px on short phones, still smooth.')
console.log('0.62: margin 0.141 = 0.103h = 41px @400, 68px @667, fade range 0.38')
console.log('0.65: margin 0.171 = 50px @400, 83px @667, fade range 0.35')
