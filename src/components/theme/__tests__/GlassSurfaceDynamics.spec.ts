import { shallowMount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GlassSurfaceDynamics from '@/components/theme/GlassSurfaceDynamics.vue'

function createMediaQueryList(
  query: string,
  preferences: { reducedMotion?: boolean; reducedTransparency?: boolean } = {},
) {
  return {
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches:
      (preferences.reducedMotion && query === '(prefers-reduced-motion: reduce)') ||
      (preferences.reducedTransparency && query === '(prefers-reduced-transparency: reduce)') ||
      false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList
}

function setVisibleRect(element: HTMLElement, rect: Partial<DOMRect> = {}) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    bottom: 220,
    height: 200,
    left: 0,
    right: 320,
    top: 20,
    width: 320,
    x: 0,
    y: 20,
    toJSON: () => ({}),
    ...rect,
  })
}

class ImmediateIntersectionObserver implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = '0px'
  readonly thresholds = [0]

  constructor(private readonly callback: IntersectionObserverCallback) {}

  disconnect() {}
  observe(target: Element) {
    const rect = target.getBoundingClientRect()
    this.callback(
      [
        {
          intersectionRect: rect,
          isIntersecting: rect.width > 0 && rect.height > 0,
          target,
        } as IntersectionObserverEntry,
      ],
      this,
    )
  }
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
  unobserve() {}
}

const defaultProps = {
  appearance: 'clear' as const,
  deformationStrength: 40,
  flowStrength: 40,
  quality: 'high' as const,
  routeKey: '/dashboard',
  translationStrength: 40,
}

describe('GlassSurfaceDynamics', () => {
  let frameCallbacks: FrameRequestCallback[]

  function flushFrame(timestamp = 16) {
    const callbacks = frameCallbacks.splice(0)
    callbacks.forEach(callback => callback(timestamp))
  }

  function mountDynamics(props: Partial<typeof defaultProps> = {}) {
    return shallowMount(GlassSurfaceDynamics, { props: { ...defaultProps, ...props } })
  }

  function createSurface(className = 'app-hover-lift-card') {
    const element = document.createElement('article')
    element.className = className
    setVisibleRect(element)
    document.body.append(element)

    return element
  }

  function getDisplacement(element: HTMLElement) {
    const filterValue = element.style.getPropertyValue('--glass-surface-displacement-filter')
    const id = filterValue.match(/#([^"]+)/)?.[1]

    return id ? document.querySelector<SVGFEDisplacementMapElement>(`#${id} feDisplacementMap`) : null
  }

  function getOffset(element: HTMLElement) {
    const filterValue = element.style.getPropertyValue('--glass-surface-displacement-filter')
    const id = filterValue.match(/#([^"]+)/)?.[1]

    return id ? document.querySelector<SVGFEOffsetElement>(`#${id} feOffset`) : null
  }

  function dispatchPointer(element: HTMLElement, clientX: number, clientY: number, timestamp: number) {
    const event = new MouseEvent('pointermove', { bubbles: true, clientX, clientY })
    Object.defineProperty(event, 'timeStamp', { value: timestamp })
    element.dispatchEvent(event)
  }

  beforeEach(() => {
    frameCallbacks = []
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280, writable: true })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800, writable: true })
    vi.stubGlobal('CSS', { supports: vi.fn(() => true) })
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36',
    })
    vi.stubGlobal(
      'matchMedia',
      vi.fn(query => createMediaQueryList(query)),
    )
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(callback => {
        frameCallbacks.push(callback)

        return frameCallbacks.length
      }),
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver)
  })

  afterEach(() => {
    document.body.innerHTML = ''
    delete document.documentElement.dataset.glassDynamicsQuality
    delete document.documentElement.dataset.glassDynamicsState
    delete document.documentElement.dataset.glassDisplacementCapability
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('applies one native displacement contract to fixed and scrolling surfaces without a canvas', () => {
    const navigation = createSurface('layout-vertical-nav')
    const page = document.createElement('main')
    page.className = 'layout-page-content'
    const card = document.createElement('article')
    card.className = 'v-card'
    setVisibleRect(card)
    page.append(card)
    document.body.append(page)

    const wrapper = mountDynamics()

    expect(navigation).toHaveAttribute('data-glass-surface-dynamics')
    expect(card).toHaveAttribute('data-glass-surface-dynamics')
    expect(getDisplacement(navigation)).not.toBeNull()
    expect(getDisplacement(card)).not.toBeNull()
    expect(document.querySelectorAll('[data-glass-displacement-registry]')).toHaveLength(1)
    expect(document.documentElement.dataset.glassDynamicsState).toBe('ready')
    expect(document.documentElement.dataset.glassDisplacementCapability).toBe('svg-backdrop')
    expect(document.querySelector('canvas')).toBeNull()

    wrapper.unmount()
    expect(navigation).not.toHaveAttribute('data-glass-surface-dynamics')
    expect(card).not.toHaveAttribute('data-glass-surface-dynamics')
    expect(document.querySelector('[data-glass-displacement-registry]')).toBeNull()
  })

  it('folds nested cards into the top-level surface contract', () => {
    const page = document.createElement('main')
    page.className = 'layout-page-content'
    const outer = document.createElement('article')
    outer.className = 'v-card'
    setVisibleRect(outer)
    const inner = document.createElement('article')
    inner.className = 'v-card app-hover-lift-card'
    setVisibleRect(inner)
    outer.append(inner)
    page.append(outer)
    document.body.append(page)

    const wrapper = mountDynamics()

    expect(outer).toHaveAttribute('data-glass-surface-dynamics')
    expect(inner).not.toHaveAttribute('data-glass-surface-dynamics')
    expect(document.querySelectorAll('filter')).toHaveLength(1)
    wrapper.unmount()
  })

  it('binds public plugin surfaces and every dynamic overlay consumer', () => {
    const overlay = document.createElement('div')
    overlay.className = 'v-overlay__content'
    const list = createSurface('v-list')
    overlay.append(list)
    document.body.append(overlay)
    const snackbar = createSurface('v-snackbar__wrapper')
    const tooltip = document.createElement('div')
    tooltip.className = 'v-tooltip'
    const tooltipContent = createSurface('v-overlay__content')
    tooltip.append(tooltipContent)
    document.body.append(tooltip)
    const pluginSurface = createSurface('')
    pluginSurface.dataset.glassOpticalSurface = ''
    const surfaces = [list, snackbar, tooltipContent, pluginSurface]

    const wrapper = mountDynamics()

    for (const surface of surfaces) {
      expect(surface).toHaveAttribute('data-glass-surface-dynamics')
      expect(getDisplacement(surface)).not.toBeNull()
    }
    wrapper.unmount()
  })

  it.each([
    { active: 40, disabled: 0, prop: 'deformationStrength' as const },
    { active: 40, disabled: 0, prop: 'translationStrength' as const },
    { active: 40, disabled: 0, prop: 'flowStrength' as const },
  ])('gives $prop an independent zero boundary', ({ active, disabled, prop }) => {
    const disabledSurface = createSurface()
    const disabledWrapper = mountDynamics({ [prop]: disabled })
    dispatchPointer(disabledSurface, 40, 60, 10)
    dispatchPointer(disabledSurface, 120, 60, 26)
    flushFrame(42)
    const disabledScale = Number(getDisplacement(disabledSurface)?.getAttribute('scale'))
    const disabledOffset = Number(getOffset(disabledSurface)?.getAttribute('dx'))
    disabledWrapper.unmount()
    disabledSurface.remove()

    const activeSurface = createSurface()
    const activeWrapper = mountDynamics({ [prop]: active })
    dispatchPointer(activeSurface, 40, 60, 10)
    dispatchPointer(activeSurface, 120, 60, 26)
    flushFrame(42)
    const activeScale = Number(getDisplacement(activeSurface)?.getAttribute('scale'))
    const activeOffset = Number(getOffset(activeSurface)?.getAttribute('dx'))

    if (prop === 'translationStrength') {
      expect(disabledOffset).toBe(0)
      expect(activeOffset).toBeGreaterThan(0)
    } else {
      expect(disabledScale).toBe(0)
      expect(activeScale).toBeGreaterThan(0)
    }
    activeWrapper.unmount()
  })

  it('moves the hit surface displacement field without writing wallpaper coordinates', () => {
    const first = createSurface()
    const second = createSurface()
    dispatchPointer(first, 40, 60, 10)
    dispatchPointer(first, 120, 60, 26)

    const wrapper = mountDynamics()
    dispatchPointer(first, 40, 60, 10)
    dispatchPointer(first, 120, 60, 26)
    flushFrame(42)

    expect(Number(getDisplacement(first)?.getAttribute('scale'))).toBeGreaterThan(0)
    expect(Number(getOffset(first)?.getAttribute('dx'))).toBeGreaterThan(0)
    expect(Number(getDisplacement(second)?.getAttribute('scale'))).toBe(0)
    expect(first.style.cssText).not.toContain('scroll')
    expect(first.style.cssText).not.toContain('wallpaper')
    wrapper.unmount()
  })

  it('uses a bounded mobile filter registry and low uniform scroll displacement', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800, writable: true })
    const scrollContainer = document.createElement('section')
    document.body.append(scrollContainer)
    const surfaces = Array.from({ length: 10 }, () => createSurface())
    const wrapper = mountDynamics()

    expect(document.querySelectorAll('filter')).toHaveLength(8)
    scrollContainer.scrollTop = 96
    scrollContainer.dispatchEvent(new Event('scroll'))

    const scales = surfaces
      .map(surface => Number(getDisplacement(surface)?.getAttribute('scale')))
      .filter(scale => Number.isFinite(scale) && scale > 0)
    expect(scales).toHaveLength(8)
    expect(Math.max(...scales)).toBeLessThan(12)
    wrapper.unmount()
  })

  it('reconciles the desktop registry down to the mobile budget on resize', () => {
    Array.from({ length: 12 }, () => createSurface())
    const wrapper = mountDynamics()

    expect(document.querySelectorAll('filter')).toHaveLength(12)
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800, writable: true })
    window.dispatchEvent(new Event('resize'))

    expect(document.querySelectorAll('filter')).toHaveLength(8)
    wrapper.unmount()
  })

  it('synchronizes virtual-list replacements and releases removed filter definitions', async () => {
    const page = document.createElement('main')
    page.className = 'layout-page-content'
    const original = document.createElement('article')
    original.className = 'v-card'
    setVisibleRect(original)
    page.append(original)
    document.body.append(page)
    const wrapper = mountDynamics()
    const originalFilter = original.style.getPropertyValue('--glass-surface-displacement-filter')
    const originalFilterId = originalFilter.match(/#([^"]+)/)?.[1]

    const replacement = document.createElement('article')
    replacement.className = 'v-card'
    setVisibleRect(replacement)
    original.replaceWith(replacement)
    await nextTick()
    await Promise.resolve()
    flushFrame(32)

    expect(original.style.getPropertyValue('--glass-surface-displacement-filter')).toBe('')
    expect(originalFilterId).toBeTruthy()
    expect(document.getElementById(originalFilterId ?? '')).toBeNull()
    expect(getDisplacement(replacement)).not.toBeNull()
    wrapper.unmount()
  })

  it('removes displacement when reduced transparency is requested', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(query => createMediaQueryList(query, { reducedTransparency: true })),
    )
    const card = createSurface()

    const wrapper = mountDynamics()

    expect(document.documentElement.dataset.glassDynamicsState).toBe('disabled')
    expect(card.style.getPropertyValue('--glass-surface-displacement-filter')).toBe('')
    expect(document.querySelector('[data-glass-displacement-registry]')).toBeNull()
    wrapper.unmount()
  })

  it('keeps a static displacement response and stops trail evolution under reduced motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(query => createMediaQueryList(query, { reducedMotion: true })),
    )
    const card = createSurface()
    const wrapper = mountDynamics()
    vi.mocked(requestAnimationFrame).mockClear()

    dispatchPointer(card, 80, 80, 16)

    expect(Number(getDisplacement(card)?.getAttribute('scale'))).toBeGreaterThan(0)
    expect(Number(getOffset(card)?.getAttribute('dx'))).toBe(0)
    expect(requestAnimationFrame).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('uses an explicit static-backplate capability state on Safari', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15',
    })
    const card = createSurface()

    const wrapper = mountDynamics()

    expect(document.documentElement.dataset.glassDynamicsState).toBe('unsupported')
    expect(document.documentElement.dataset.glassDisplacementCapability).toBe('static-backplate')
    expect(card.style.getPropertyValue('--glass-surface-displacement-filter')).toBe('')
    expect(document.querySelector('[data-glass-displacement-registry]')).toBeNull()
    wrapper.unmount()
  })

  it('resets touch velocity between gestures', () => {
    const card = createSurface()
    const wrapper = mountDynamics()
    const dispatchTouch = (type: string, clientX: number, timestamp: number) => {
      const event = new Event(type, { bubbles: true })
      const touch = { clientX, clientY: 70 }
      Object.defineProperty(event, 'timeStamp', { value: timestamp })
      Object.defineProperty(event, 'touches', {
        value: { item: () => (type === 'touchcancel' ? null : touch) },
      })
      Object.defineProperty(event, 'changedTouches', {
        value: { item: () => touch },
      })
      card.dispatchEvent(event)
    }

    dispatchTouch('touchstart', 40, 10)
    dispatchTouch('touchmove', 120, 26)
    dispatchTouch('touchcancel', 120, 32)
    dispatchTouch('touchstart', 240, 48)
    flushFrame(64)

    expect(Number(getOffset(card)?.getAttribute('dx'))).toBe(0)
    wrapper.unmount()
  })

  it('normalizes displacement decay by elapsed time instead of refresh rate', () => {
    const runFrames = (times: number[]) => {
      const card = createSurface()
      const wrapper: VueWrapper = mountDynamics()
      dispatchPointer(card, 40, 60, 10)
      dispatchPointer(card, 120, 60, 26)
      times.forEach(flushFrame)
      const result = {
        energy: Number(card.style.getPropertyValue('--glass-dynamics-energy')),
        offset: Number(getOffset(card)?.getAttribute('dx')),
      }
      wrapper.unmount()
      card.remove()
      frameCallbacks = []

      return result
    }

    const sixtyHertz = runFrames([42, 58])
    const oneTwentyHertz = runFrames([34, 42, 50, 58])

    expect(oneTwentyHertz.energy).toBeCloseTo(sixtyHertz.energy, 3)
    expect(oneTwentyHertz.offset).toBeCloseTo(sixtyHertz.offset, 1)
  })
})
