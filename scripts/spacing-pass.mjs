import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
chromium.graphicsMode = true
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args, '--no-sandbox'], headless: 'shell',
})
const WIDTHS = [360, 390, 768, 1280]
let fail = 0
for (const w of WIDTHS) {
  const p = await b.newPage()
  await p.setViewport({ width: w, height: w >= 768 ? 900 : 780, deviceScaleFactor: 1 })
  await p.goto('http://localhost:4173', { waitUntil: 'networkidle2' })
  await sleep(3000)
  const m = await p.evaluate(() => {
    const rect = (s) => { const e = document.querySelector(s); if (!e) return null
      const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), h: Math.round(r.height) } }
    const byLabel = (pre) => { const e = Array.from(document.querySelectorAll('[aria-label]')).find(x => (x.getAttribute('aria-label')||'').startsWith(pre)); if(!e) return null
      const r = e.getBoundingClientRect(); return { t: Math.round(r.top), b: Math.round(r.bottom) } }
    const main = rect('main'), header = rect('header')
    const h1 = rect('h1')
    const sub = byLabel('Watch the water')
    const ctaRow = document.querySelector('a[href="/map"].bg-accent')?.closest('div')
    const cta = ctaRow ? (()=>{const r=ctaRow.getBoundingClientRect();return {t:Math.round(r.top),b:Math.round(r.bottom)}})() : null
    const live = rect('section[aria-label="Live status"]')
    const figs = rect('section[aria-label="Figures"]')
    const how  = rect('section[aria-label="How it works"]')
    const eyebrow = byLabel('Community early warning')
    const navs = Array.from(document.querySelectorAll('header a')).map(a=>{const r=a.getBoundingClientRect()
      return {txt:a.textContent.trim().slice(0,10), l:Math.round(r.left), r:Math.round(r.right), h:Math.round(r.height)}})
    const gaps=[]; for(let i=1;i<navs.length;i++) gaps.push(navs[i].l-navs[i-1].r)
    const li = document.querySelectorAll('section[aria-label="How it works"] li')
    const liGap = li.length>1 ? Math.round(li[1].getBoundingClientRect().top - li[0].getBoundingClientRect().bottom) : null
    // widest element overflow check
    let worst=null
    document.querySelectorAll('main *').forEach(e=>{const r=e.getBoundingClientRect()
      if(r.width>0 && (r.right>window.innerWidth+0.5||r.left<-0.5)){const o=Math.max(r.right-window.innerWidth,-r.left)
        if(!worst||o>worst.o) worst={tag:e.tagName,cls:String(e.className).slice(0,40),o:Math.round(o)}}})
    return { vw: window.innerWidth,
      padL: main.l, padR: window.innerWidth - main.r,
      headerH: header.h,
      headerToEyebrow: eyebrow ? eyebrow.t - header.b : null,
      eyebrowToH1: eyebrow ? h1.t - eyebrow.b : null,
      h1ToSub: sub ? sub.t - h1.b : null,
      subToCta: (sub&&cta) ? cta.t - sub.b : null,
      ctaToLive: (cta&&live) ? live.t - cta.b : null,
      liveToFigs: figs.t - live.b, figsToHow: how.t - figs.b,
      listItemGap: liGap,
      navGaps: gaps, navRightEdge: window.innerWidth - (navs.at(-1)?.r ?? 0),
      navHeights: navs.map(n=>n.h),
      navRows: new Set(Array.from(document.querySelectorAll('header a')).map(a=>Math.round(a.getBoundingClientRect().top))).size,
      hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      overflow: worst,
    }
  })
  const bad = m.hscroll || m.overflow
  if (bad) fail++
  console.log(`\n=== ${w}px ${bad?'*** PROBLEM ***':'ok'} ===`)
  console.log(`  side padding      L=${m.padL} R=${m.padR}`)
  console.log(`  header height     ${m.headerH}   nav gaps ${JSON.stringify(m.navGaps)}  right edge ${m.navRightEdge}  heights ${JSON.stringify(m.navHeights)}  rows ${m.navRows}`)
  console.log(`  header -> eyebrow ${m.headerToEyebrow}`)
  console.log(`  eyebrow -> h1     ${m.eyebrowToH1}`)
  console.log(`  h1 -> subheading  ${m.h1ToSub}`)
  console.log(`  subheading -> CTA ${m.subToCta}`)
  console.log(`  CTA -> live row   ${m.ctaToLive}`)
  console.log(`  live -> stats     ${m.liveToFigs}     stats -> how ${m.figsToHow}`)
  console.log(`  list item gap     ${m.listItemGap}`)
  console.log(`  h-scroll ${m.hscroll} (${m.sw} vs ${m.cw})  overflow ${JSON.stringify(m.overflow)}`)
  await p.screenshot({ path: `./shots/sp-${w}.png` })
  await p.screenshot({ path: `./shots/sp-${w}-full.png`, fullPage: true })
  await p.close()
}
await b.close()
console.log(`\n${fail === 0 ? 'ALL WIDTHS CLEAN' : fail + ' width(s) with overflow'}`)
