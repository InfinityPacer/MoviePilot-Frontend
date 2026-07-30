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
    const isIntersecting =
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.left < window.innerWidth &&
      rect.top < window.innerHeight
    this.callback(
      [
        {
          intersectionRect: rect,
          isIntersecting,
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
  appearance: 'clear' as 'clear' | 'frosted' | 'tinted',
  deformationStrength: 40,
  flowStrength: 40,
  quality: 'high' as 'balanced' | 'high',
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

  function dispatchPointer(
    element: HTMLElement,
    clientX: number,
    clientY: number,
    timestamp: number,
    options: { pointerId?: number; pointerType?: string; type?: string } = {},
  ) {
    const event = new MouseEvent(options.type ?? 'pointermove', { bubbles: true, clientX, clientY })
    Object.defineProperty(event, 'timeStamp', { value: timestamp })
    Object.defineProperty(event, 'pointerId', { value: options.pointerId ?? 1 })
    Object.defineProperty(event, 'pointerType', { value: options.pointerType ?? 'mouse' })
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
    expect(document.querySelector('feTurbulence')?.getAttribute('numOctaves')).toBe('4')
    expect([...document.querySelector('filter')!.children].map(node => node.tagName)).toEqual([
      'feTurbulence',
      'feOffset',
      'feDisplacementMap',
    ])
    expect(document.querySelector('canvas')).toBeNull()

    wrapper.unmount()
    expect(navigation).not.toHaveAttribute('data-glass-surface-dynamics')
    expect(card).not.toHaveAttribute('data-glass-surface-dynamics')
    expect(document.querySelector('[data-glass-displacement-registry]')).toBeNull()
  })

  it('uses a lower-cost two-octave field for balanced quality', () => {
    createSurface()
    const wrapper = mountDynamics({ quality: 'balanced' })

    expect(document.querySelector('feTurbulence')?.getAttribute('numOctaves')).toBe('2')
    wrapper.unmount()
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

  it('uses stronger frosted compensation for direct input than low-energy propagation', () => {
    const readPointerScale = (appearance: 'clear' | 'frosted') => {
      const surface = createSurface()
      const wrapper = mountDynamics({ appearance })
      dispatchPointer(surface, 40, 60, 10)
      dispatchPointer(surface, 120, 60, 26)
      flushFrame(42)
      const scale = Number(getDisplacement(surface)?.getAttribute('scale'))
      wrapper.unmount()
      surface.remove()
      frameCallbacks = []

      return scale
    }

    const readScrollScale = (appearance: 'clear' | 'frosted') => {
      const scrollContainer = document.createElement('section')
      document.body.append(scrollContainer)
      const surface = createSurface()
      const wrapper = mountDynamics({ appearance })
      scrollContainer.dispatchEvent(new Event('scroll'))
      scrollContainer.scrollTop = 1
      const scrollEvent = new Event('scroll')
      Object.defineProperty(scrollEvent, 'timeStamp', { value: 16 })
      scrollContainer.dispatchEvent(scrollEvent)
      flushFrame(32)
      const scale = Number(getDisplacement(surface)?.getAttribute('scale'))
      wrapper.unmount()
      scrollContainer.remove()
      surface.remove()
      frameCallbacks = []

      return scale
    }

    const directRatio = readPointerScale('frosted') / readPointerScale('clear')
    const lowEnergyRatio = readScrollScale('frosted') / readScrollScale('clear')

    expect(directRatio).toBeCloseTo(1.5, 2)
    expect(lowEnergyRatio).toBeGreaterThanOrEqual(1.2)
    expect(lowEnergyRatio).toBeLessThan(1.21)
  })

  it('commits pointer energy immediately and applies flow only during release', () => {
    const runFlow = (flowStrength: number) => {
      const surface = createSurface()
      const wrapper = mountDynamics({ flowStrength })
      dispatchPointer(surface, 40, 60, 10)
      dispatchPointer(surface, 120, 60, 26)
      const immediate = Number(surface.style.getPropertyValue('--glass-dynamics-energy'))
      flushFrame(42)
      const firstFrame = Number(surface.style.getPropertyValue('--glass-dynamics-energy'))
      flushFrame(400)
      const release = Number(surface.style.getPropertyValue('--glass-dynamics-energy'))
      wrapper.unmount()
      surface.remove()
      frameCallbacks = []

      return { firstFrame, immediate, release }
    }

    const shortFlow = runFlow(20)
    const longFlow = runFlow(80)

    expect(shortFlow.immediate).toBeGreaterThan(0.2)
    expect(shortFlow.immediate).toBeCloseTo(longFlow.immediate, 3)
    expect(shortFlow.firstFrame).toBeCloseTo(shortFlow.immediate, 3)
    expect(longFlow.firstFrame).toBeCloseTo(longFlow.immediate, 3)
    expect(shortFlow.release).toBeLessThan(longFlow.release)
  })

  it('broadcasts one pointer field across nearby surfaces without writing wallpaper coordinates', () => {
    const first = createSurface()
    const second = createSurface()
    setVisibleRect(second, { left: 380, right: 700, width: 320 })
    const distant = createSurface()
    setVisibleRect(distant, { left: 1100, right: 1260, width: 160 })
    dispatchPointer(first, 40, 60, 10)
    dispatchPointer(first, 120, 60, 26)

    const wrapper = mountDynamics()
    dispatchPointer(first, 40, 60, 10)
    dispatchPointer(first, 120, 60, 26)
    flushFrame(42)

    expect(Number(getDisplacement(first)?.getAttribute('scale'))).toBeGreaterThan(0)
    expect(Number(getOffset(first)?.getAttribute('dx'))).toBeGreaterThan(0)
    expect(Number(getDisplacement(second)?.getAttribute('scale'))).toBeGreaterThan(0)
    expect(Number(getOffset(second)?.getAttribute('dx'))).toBeGreaterThan(0)
    expect(Number(getOffset(second)?.getAttribute('dx'))).toBeLessThan(Number(getOffset(first)?.getAttribute('dx')))
    expect(Number(getDisplacement(distant)?.getAttribute('scale'))).toBe(0)
    expect(first.style.cssText).not.toContain('scroll')
    expect(first.style.cssText).not.toContain('wallpaper')
    wrapper.unmount()
  })

  it('isolates overlay interaction from surfaces behind the active overlay', () => {
    const background = createSurface()
    const overlay = document.createElement('div')
    overlay.className = 'v-overlay__content'
    const dialog = document.createElement('article')
    dialog.className = 'v-card'
    setVisibleRect(dialog, { left: 240, right: 720, width: 480 })
    overlay.append(dialog)
    document.body.append(overlay)
    const wrapper = mountDynamics()

    dispatchPointer(dialog, 300, 80, 10)
    dispatchPointer(dialog, 380, 80, 26)
    flushFrame(42)

    expect(Number(getDisplacement(dialog)?.getAttribute('scale'))).toBeGreaterThan(0)
    expect(Number(getDisplacement(background)?.getAttribute('scale'))).toBe(0)
    wrapper.unmount()
  })

  it('replaces pointer direction synchronously without an attack window', () => {
    const surface = createSurface()
    const wrapper = mountDynamics()
    dispatchPointer(surface, 40, 60, 10)
    dispatchPointer(surface, 120, 60, 18)
    flushFrame(26)
    const forwardOffset = Number(getOffset(surface)?.getAttribute('dx'))

    dispatchPointer(surface, 40, 60, 34)
    flushFrame(42)
    flushFrame(58)
    const reversedOffset = Number(getOffset(surface)?.getAttribute('dx'))

    expect(forwardOffset).toBeGreaterThan(0)
    expect(reversedOffset).toBeLessThan(forwardOffset)
    wrapper.unmount()
  })

  it('integrates continuous pointer input consistently across event frequencies', () => {
    const runInput = (eventInterval: number) => {
      const surface = createSurface()
      const wrapper = mountDynamics()

      for (let timestamp = 8; timestamp <= 968; timestamp += 4) {
        if ((timestamp - 8) % eventInterval === 0) {
          dispatchPointer(surface, 40 + (timestamp - 8) * 0.08, 60, timestamp)
        }
        if ((timestamp - 8) % 16 === 0) flushFrame(timestamp)
      }
      flushFrame(984)
      const offset = Number(getOffset(surface)?.getAttribute('dx'))
      wrapper.unmount()
      surface.remove()
      frameCallbacks = []

      return offset
    }

    const offsets = [4, 8, 16, 32].map(runInput)
    expect(Math.max(...offsets) - Math.min(...offsets)).toBeLessThan(0.08)
  })

  it('bounds sustained flow inside the filter bleed and releases the bound after reversal', () => {
    const surface = createSurface()
    const wrapper = mountDynamics()

    for (let index = 0; index <= 180; index += 1) {
      const timestamp = 8 + index * 16
      dispatchPointer(surface, 40 + index * 20, 60, timestamp)
      flushFrame(timestamp)
    }
    const saturatedOffset = Number(getOffset(surface)?.getAttribute('dx'))

    for (let index = 1; index <= 20; index += 1) {
      const timestamp = 2904 + index * 16
      dispatchPointer(surface, 3640 - index * 20, 60, timestamp)
      flushFrame(timestamp)
    }
    const reversedOffset = Number(getOffset(surface)?.getAttribute('dx'))

    expect(saturatedOffset).toBeCloseTo(320 * 0.12, 2)
    expect(reversedOffset).toBeLessThan(saturatedOffset)
    wrapper.unmount()
  })

  it('uses a bounded mobile filter registry and low uniform scroll displacement', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800, writable: true })
    const scrollContainer = document.createElement('section')
    document.body.append(scrollContainer)
    const surfaces = Array.from({ length: 10 }, () => createSurface())
    const wrapper = mountDynamics()

    expect(document.querySelectorAll('filter')).toHaveLength(8)
    scrollContainer.dispatchEvent(new Event('scroll'))
    scrollContainer.scrollTop = 96
    const scrollEvent = new Event('scroll')
    Object.defineProperty(scrollEvent, 'timeStamp', { value: 16 })
    scrollContainer.dispatchEvent(scrollEvent)
    flushFrame(32)

    const scales = surfaces
      .map(surface => Number(getDisplacement(surface)?.getAttribute('scale')))
      .filter(scale => Number.isFinite(scale) && scale > 0)
    expect(scales).toHaveLength(8)
    expect(Math.max(...scales)).toBeLessThan(12)
    wrapper.unmount()
  })

  it('baselines a newly observed non-zero scroll target before applying small deltas', () => {
    const scrollContainer = document.createElement('section')
    document.body.append(scrollContainer)
    const surface = createSurface()
    const wrapper = mountDynamics()

    scrollContainer.scrollTop = 480
    scrollContainer.dispatchEvent(new Event('scroll'))
    flushFrame(16)
    expect(Number(getDisplacement(surface)?.getAttribute('scale'))).toBe(0)

    scrollContainer.scrollTop = 481
    const scrollEvent = new Event('scroll')
    Object.defineProperty(scrollEvent, 'timeStamp', { value: 24 })
    scrollContainer.dispatchEvent(scrollEvent)
    flushFrame(40)

    const scale = Number(getDisplacement(surface)?.getAttribute('scale'))
    expect(scale).toBeGreaterThan(0)
    expect(scale).toBeLessThan(4)
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

  it('keeps the bounded registry stable across repeated broadcasts and ignores offscreen surfaces', () => {
    const surfaces = Array.from({ length: 12 }, () => createSurface())
    const offscreen = createSurface()
    setVisibleRect(offscreen, { bottom: 1100, top: 900, y: 900 })
    const wrapper = mountDynamics()
    const initialFilterIds = [...document.querySelectorAll('filter')].map(filter => filter.id)

    for (let timestamp = 8; timestamp <= 64; timestamp += 8) {
      dispatchPointer(surfaces[0], 40 + timestamp * 2, 60, timestamp)
      flushFrame(timestamp)
    }

    expect([...document.querySelectorAll('filter')].map(filter => filter.id)).toEqual(initialFilterIds)
    expect(initialFilterIds).toHaveLength(12)
    expect(offscreen.style.getPropertyValue('--glass-surface-displacement-filter')).toBe('')
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

  it('resets direct-pointer coordinates and ignores legacy duplicate touch events', () => {
    const runGesture = (withMouseInput: boolean) => {
      const card = createSurface()
      const wrapper = mountDynamics()
      if (withMouseInput) dispatchPointer(card, 40, 70, 10)
      dispatchPointer(card, 240, 70, 10, { pointerId: 7, pointerType: 'touch', type: 'pointerdown' })
      dispatchPointer(card, 248, 70, 18, { pointerId: 7, pointerType: 'touch' })
      card.dispatchEvent(new Event('touchmove', { bubbles: true }))
      flushFrame(42)
      const offset = Number(getOffset(card)?.getAttribute('dx'))
      dispatchPointer(card, 248, 70, 48, { pointerId: 7, pointerType: 'touch', type: 'pointercancel' })
      wrapper.unmount()
      card.remove()
      frameCallbacks = []

      return offset
    }

    const isolatedTouch = runGesture(false)
    const touchAfterMouse = runGesture(true)

    expect(isolatedTouch).toBeGreaterThan(0)
    expect(touchAfterMouse).toBeCloseTo(isolatedTouch, 3)
  })

  it('normalizes release energy across frame rates and bounds offset after long gaps', () => {
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
    const denseFrames = (end: number) => {
      const times: number[] = []
      for (let timestamp = 42; timestamp < end; timestamp += 16) times.push(timestamp)
      if (times.at(-1) !== end) times.push(end)

      return times
    }
    const denseRelease = runFrames(denseFrames(400))
    const sparseRelease = runFrames([42, 58, 400])
    const denseLongGap = runFrames(denseFrames(2000))
    const sparseLongGap = runFrames([42, 58, 2000])

    expect(oneTwentyHertz.energy).toBeCloseTo(sixtyHertz.energy, 3)
    expect(oneTwentyHertz.offset).toBeCloseTo(sixtyHertz.offset, 3)
    expect(sparseRelease.energy).toBeCloseTo(denseRelease.energy, 3)
    expect(sparseRelease.offset).toBeCloseTo(denseRelease.offset, 3)
    expect(sparseLongGap.energy).toBeCloseTo(denseLongGap.energy, 3)
    expect(sparseLongGap.offset).toBeCloseTo(denseLongGap.offset, 2)
    expect(sparseLongGap.offset).toBeLessThan(8)
  })
})
