// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Landing } from './Landing'
import { clearDemoData, createDemoBackend } from '../lib/backend.demo'
import { setBackendForTesting } from '../lib/backend'
import { useAppStore } from '../store'

/**
 * The motion pass (§15) put a WebGL background and a blur-in text reveal on a
 * page whose job is to warn people about poisonous shellfish. These tests are
 * the guardrail for that: they assert the *safety-relevant* content is on
 * screen and reachable regardless of what the animation layer does.
 *
 * The rule being enforced: no CTA, no disclaimer and no PSP primer line may
 * depend on an IntersectionObserver firing, a shader compiling, or a lazy
 * chunk arriving.
 */

// The hero's WebGL chunk is never evaluated here — jsdom has no WebGL, and
// the point is that the page is complete without it.
vi.mock('../components/ferrofluid/Ferrofluid', () => ({
  default: () => <div data-testid="ferrofluid-canvas" />,
}))

function renderLanding() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  clearDemoData()
  setBackendForTesting(createDemoBackend())
  useAppStore.setState({ zones: [], reports: [], zonesReady: false, reportsReady: false })

  // No IntersectionObserver in jsdom. Leaving it undefined is itself the
  // interesting case: it is the "old phone / bot / reader mode" path, and the
  // copy must still be there.
  vi.stubGlobal('IntersectionObserver', undefined)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  setBackendForTesting(null)
})

describe('landing motion pass — safety content is never gated on animation', () => {
  it('renders both CTAs immediately, with working hrefs', () => {
    renderLanding()

    const openMap = screen.getByRole('link', { name: /open the map/i })
    const report = screen.getByRole('link', { name: /report a sighting/i })

    expect(openMap.getAttribute('href')).toBe('/map')
    expect(report.getAttribute('href')).toBe('/map')
  })

  it('keeps the "not an official BFAR advisory" disclaimer present and unanimated', () => {
    const { container } = renderLanding()

    const disclaimer = screen.getByText(/not an official BFAR advisory/i)
    expect(disclaimer).toBeTruthy()

    // It must be a plain text node, not a pile of per-word animated spans that
    // start at opacity 0.
    expect(disclaimer.querySelectorAll('span[aria-hidden="true"]').length).toBe(0)
    expect(container.textContent).toContain('not an official BFAR advisory')
  })

  it('keeps the PSP primer — the actual health warning — as plain text', () => {
    renderLanding()

    // Only BFAR can confirm; this app does not replace official advisories.
    expect(screen.getByText(/Only BFAR can confirm red tide by lab test/i)).toBeTruthy()
    expect(screen.getByText(/Cooking does not destroy the/i)).toBeTruthy()
  })

  it('renders the animated hero and list copy even with no IntersectionObserver', () => {
    const { container } = renderLanding()

    // Every BlurText block falls back to "already in view" rather than waiting
    // forever for an observer that does not exist.
    expect(container.textContent).toContain('Community early warning')
    expect(container.textContent).toContain(
      'Watch the water, report what you see, and warn Puerto Princesa',
    )
    expect(container.textContent).toContain('Find your shore')
    expect(container.textContent).toContain('A local admin verifies it')
  })

  it('keeps the headline readable as "Red Tide" to assistive tech', () => {
    renderLanding()
    expect(screen.getByRole('heading', { name: 'Red Tide' })).toBeTruthy()
  })

  it('does not animate the copy into a different string than what shipped', () => {
    const { container } = renderLanding()

    // Guards against a refactor silently rewording safety copy while moving it
    // into the animation component.
    const text = container.textContent ?? ''
    expect(text).toContain('six zones cover the coast, from the city bay to St. Paul Bay.')
    expect(text).toContain('water colour, dead shellfish; ten words is enough.')
    expect(text).toContain('if it checks out, the zone goes under advisory.')
  })
})
