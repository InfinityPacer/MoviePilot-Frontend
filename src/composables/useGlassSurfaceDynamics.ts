import { onMounted, onScopeDispose, ref, toValue, watchEffect, type MaybeRefOrGetter } from 'vue'
import type { ThemeCustomizerGlassAppearance } from '@/composables/useThemeCustomizer'
import { supportsGlassBackdropDisplacement } from '@/utils/glassDisplacement'
import { normalizeGlassOpticalStrength, type GlassOpticalQuality } from '@/utils/glassOptics'

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const GLASS_SURFACE_SELECTORS = [
  '.agent-assistant-panel',
  '.footer-nav-card',
  '.login-card',
  '.layout-vertical-nav',
  '.layout-navbar',
  '.plugin-quick-access.v-card',
  '.theme-customizer-panel-host',
  '.v-overlay__content > .v-card',
  '.v-overlay__content > .v-list',
  '.v-overlay__content > .v-sheet',
  '.v-overlay__content > form > .v-card',
  '.v-overlay__content > form > .v-sheet',
  '.v-snackbar__wrapper',
  '.v-tooltip > .v-overlay__content',
  '.dashboard-grid-item-content > .dashboard-grid-auto-size > .dashboard-grid-content-measure > .v-card',
  '.dashboard-grid-item-content > .dashboard-grid-auto-size > .dashboard-grid-content-measure > :first-child > .v-card',
  '[data-glass-optical-surface]',
  '.app-hover-lift-card',
  '.layout-page-content .v-card',
] as const

const GLASS_SURFACE_QUERY = GLASS_SURFACE_SELECTORS.join(',')
const SURFACE_FILTER_PROPERTY = '--glass-surface-displacement-filter'
const POINTER_ENERGY_FLOOR = 0.2
const SCROLL_ENERGY_FLOOR = 0.06
const SURFACE_VISIBLE_MIN_SIZE = 24
const MAX_ACTIVE_SURFACES_DESKTOP = 12
const MAX_ACTIVE_SURFACES_MOBILE = 8
const MOBILE_LAYOUT_MAX_WIDTH = 960
let registrySequence = 0

export type GlassDynamicsState = 'disabled' | 'ready' | 'unsupported'

interface UseGlassSurfaceDynamicsOptions {
  /** 材质只调整真实位移幅度，不改变位移算法。 */
  appearance: MaybeRefOrGetter<ThemeCustomizerGlassAppearance>
  /** 局部形变控制位移幅度与噪声空间尺度。 */
  deformationStrength: MaybeRefOrGetter<number>
  /** 流动惯性控制位移能量和速度的衰减。 */
  flowStrength: MaybeRefOrGetter<number>
  /** 高质量档使用更细的位移噪声。 */
  quality: MaybeRefOrGetter<GlassOpticalQuality>
  /** 路由变化后重新同步页面表面集合。 */
  routeKey: MaybeRefOrGetter<string>
  /** 流动偏移控制位移噪声沿输入方向的推进距离。 */
  translationStrength: MaybeRefOrGetter<number>
}

interface SurfaceFilterBinding {
  displacement: SVGFEDisplacementMapElement
  element: HTMLElement
  filter: SVGFilterElement
  offset: SVGFEOffsetElement
  turbulence: SVGFETurbulenceElement
}

interface SurfaceMotion {
  binding: SurfaceFilterBinding
  energy: number
  lastUpdatedAt: number
  offsetX: number
  offsetY: number
  velocityX: number
  velocityY: number
}

interface InputPoint {
  clientX: number
  clientY: number
  timestamp: number
}

interface FilterRegistry {
  definitions: SVGDefsElement
  element: SVGSVGElement
  id: string
}

function normalizeUnitStrength(value: unknown) {
  return normalizeGlassOpticalStrength(value) / 100
}

function isVisibleSurface(element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  const style = getComputedStyle(element)

  return (
    rect.width >= SURFACE_VISIBLE_MIN_SIZE &&
    rect.height >= SURFACE_VISIBLE_MIN_SIZE &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.left < window.innerWidth &&
    rect.top < window.innerHeight &&
    style.display !== 'none' &&
    style.visibility !== 'hidden'
  )
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(name: K) {
  return document.createElementNS(SVG_NAMESPACE, name)
}

function createFilterRegistry(): FilterRegistry {
  const id = `mp-glass-displacement-${++registrySequence}`
  const element = createSvgElement('svg')
  const definitions = createSvgElement('defs')
  element.dataset.glassDisplacementRegistry = id
  element.setAttribute('aria-hidden', 'true')
  element.setAttribute('focusable', 'false')
  element.setAttribute('height', '0')
  element.setAttribute('width', '0')
  element.style.position = 'fixed'
  element.style.pointerEvents = 'none'
  element.append(definitions)
  document.body.append(element)

  return { definitions, element, id }
}

/** 判断 DOM 变更是否可能引入或移除统一玻璃表面。 */
export function containsGlassSurface(node: Node) {
  if (!(node instanceof Element)) return false
  if (node.matches(GLASS_SURFACE_QUERY)) return true

  return Boolean(node.querySelector(GLASS_SURFACE_QUERY))
}

/** 返回当前页面全部统一玻璃表面；重复 selector 命中的元素只保留一次。 */
export function collectGlassSurfaceElements() {
  const surfaces: HTMLElement[] = []
  const seen = new Set<HTMLElement>()

  for (const selector of GLASS_SURFACE_SELECTORS) {
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      if (seen.has(element)) continue
      seen.add(element)
      surfaces.push(element)
    }
  }

  return surfaces.filter(element => {
    const ancestor = element.parentElement?.closest<HTMLElement>(GLASS_SURFACE_QUERY)

    return !ancestor || !seen.has(ancestor)
  })
}

/** 管理可见玻璃表面的原生 backdrop 位移，不读取、解码或上传真实壁纸纹理。 */
export function useGlassSurfaceDynamics(options: UseGlassSurfaceDynamicsOptions) {
  const state = ref<GlassDynamicsState>('disabled')
  const surfaceCount = ref(0)
  const ownedSurfaces = new Set<HTMLElement>()
  const visibleSurfaces = new Set<HTMLElement>()
  const filterBindings = new Map<HTMLElement, SurfaceFilterBinding>()
  const motions = new Map<HTMLElement, SurfaceMotion>()
  const scrollPositions = new WeakMap<EventTarget, number>()
  let animationFrame: number | null = null
  let mutationFrame: number | null = null
  let mutationObserver: MutationObserver | null = null
  let intersectionObserver: IntersectionObserver | null = null
  let previousInput: InputPoint | null = null
  let reducedMotionQuery: MediaQueryList | null = null
  let reducedTransparencyQuery: MediaQueryList | null = null
  let registry: FilterRegistry | null = null
  let surfaceSequence = 0

  function writeRootContract() {
    const root = document.documentElement
    root.dataset.glassDynamicsState = state.value
    root.dataset.glassDynamicsQuality = toValue(options.quality)
    root.dataset.glassDisplacementCapability = state.value === 'unsupported' ? 'static-backplate' : 'svg-backdrop'
  }

  function getDisplacementScale(energy: number) {
    const deformation = normalizeUnitStrength(toValue(options.deformationStrength))
    const qualityScale = Math.sqrt(deformation) * (toValue(options.quality) === 'high' ? 42 : 26)
    const appearanceScale =
      toValue(options.appearance) === 'frosted' ? 1.08 : toValue(options.appearance) === 'tinted' ? 0.94 : 1

    return energy * qualityScale * appearanceScale
  }

  function updateFilterParameters(binding: SurfaceFilterBinding) {
    const deformation = normalizeUnitStrength(toValue(options.deformationStrength))
    const frequencyX = 0.018 - deformation * 0.009
    const frequencyY = 0.034 - deformation * 0.015
    binding.turbulence.setAttribute('baseFrequency', `${frequencyX.toFixed(4)} ${frequencyY.toFixed(4)}`)
    binding.turbulence.setAttribute('numOctaves', toValue(options.quality) === 'high' ? '3' : '2')
    const motion = motions.get(binding.element)
    const restingEnergy = reducedMotionQuery?.matches ? 0.08 : 0
    binding.displacement.setAttribute('scale', getDisplacementScale(motion?.energy ?? restingEnergy).toFixed(3))
  }

  function attachFilter(element: HTMLElement) {
    if (state.value !== 'ready' || filterBindings.has(element)) return filterBindings.get(element) ?? null
    registry ??= createFilterRegistry()
    const id = `${registry.id}-surface-${++surfaceSequence}`
    const filter = createSvgElement('filter')
    const turbulence = createSvgElement('feTurbulence')
    const offset = createSvgElement('feOffset')
    const displacement = createSvgElement('feDisplacementMap')

    filter.id = id
    filter.setAttribute('x', '-15%')
    filter.setAttribute('y', '-15%')
    filter.setAttribute('width', '130%')
    filter.setAttribute('height', '130%')
    filter.setAttribute('color-interpolation-filters', 'sRGB')
    turbulence.setAttribute('type', 'fractalNoise')
    turbulence.setAttribute('seed', '7')
    turbulence.setAttribute('result', 'glass-noise')
    offset.setAttribute('in', 'glass-noise')
    offset.setAttribute('result', 'glass-flow')
    displacement.setAttribute('in', 'SourceGraphic')
    displacement.setAttribute('in2', 'glass-flow')
    displacement.setAttribute('xChannelSelector', 'R')
    displacement.setAttribute('yChannelSelector', 'G')
    filter.append(turbulence, offset, displacement)
    registry.definitions.append(filter)

    const binding = { displacement, element, filter, offset, turbulence }
    filterBindings.set(element, binding)
    element.style.setProperty(SURFACE_FILTER_PROPERTY, `url("#${id}")`)
    updateFilterParameters(binding)

    return binding
  }

  function detachFilter(element: HTMLElement) {
    const binding = filterBindings.get(element)
    if (!binding) return
    motions.delete(element)
    binding.filter.remove()
    filterBindings.delete(element)
    element.style.removeProperty(SURFACE_FILTER_PROPERTY)
    element.style.removeProperty('--glass-dynamics-energy')
  }

  function getFilterBudget() {
    return window.innerWidth <= MOBILE_LAYOUT_MAX_WIDTH ? MAX_ACTIVE_SURFACES_MOBILE : MAX_ACTIVE_SURFACES_DESKTOP
  }

  function reserveFilter(element: HTMLElement) {
    const existing = filterBindings.get(element)
    if (existing) return existing
    if (!visibleSurfaces.has(element)) return null

    if (filterBindings.size >= getFilterBudget()) {
      const candidate =
        [...filterBindings.keys()].find(candidateElement => !motions.has(candidateElement)) ??
        filterBindings.keys().next().value
      if (candidate) detachFilter(candidate)
    }

    return attachFilter(element)
  }

  function reconcileFilterBudget() {
    if (state.value !== 'ready') return
    const allowed = new Set([...visibleSurfaces].slice(0, getFilterBudget()))
    for (const element of [...filterBindings.keys()]) {
      if (!allowed.has(element)) detachFilter(element)
    }
    for (const element of allowed) attachFilter(element)
  }

  function clearSurface(element: HTMLElement) {
    intersectionObserver?.unobserve(element)
    visibleSurfaces.delete(element)
    detachFilter(element)
    delete element.dataset.glassSurfaceDynamics
    ownedSurfaces.delete(element)
  }

  function setSurfaceVisibility(element: HTMLElement, visible: boolean) {
    if (visible) {
      visibleSurfaces.add(element)
    } else {
      visibleSurfaces.delete(element)
      detachFilter(element)
    }
    reconcileFilterBudget()
  }

  function syncSurfaces() {
    const current = new Set(collectGlassSurfaceElements())
    for (const element of ownedSurfaces) {
      if (!current.has(element) || !element.isConnected) clearSurface(element)
    }

    for (const element of current) {
      if (ownedSurfaces.has(element)) continue
      element.dataset.glassSurfaceDynamics = ''
      if (intersectionObserver) intersectionObserver.observe(element)
      else setSurfaceVisibility(element, isVisibleSurface(element))
      ownedSurfaces.add(element)
    }
    surfaceCount.value = ownedSurfaces.size
  }

  function scheduleSurfaceSync() {
    if (mutationFrame !== null) return
    mutationFrame = requestAnimationFrame(() => {
      mutationFrame = null
      syncSurfaces()
    })
  }

  function writeMotion(motion: SurfaceMotion) {
    motion.binding.offset.setAttribute('dx', motion.offsetX.toFixed(3))
    motion.binding.offset.setAttribute('dy', motion.offsetY.toFixed(3))
    motion.binding.displacement.setAttribute('scale', getDisplacementScale(motion.energy).toFixed(3))
    motion.binding.element.style.setProperty('--glass-dynamics-energy', motion.energy.toFixed(4))
  }

  function ensureAnimation() {
    if (animationFrame !== null || motions.size === 0) return
    animationFrame = requestAnimationFrame(animate)
  }

  function activateSurface(
    element: HTMLElement,
    velocity: { x: number; y: number },
    energy: number,
    timestamp: number,
  ) {
    if (state.value !== 'ready' || reducedMotionQuery?.matches) return
    const binding = reserveFilter(element)
    if (!binding) return

    const motion = motions.get(element) ?? {
      binding,
      energy: 0,
      lastUpdatedAt: timestamp,
      offsetX: 0,
      offsetY: 0,
      velocityX: 0,
      velocityY: 0,
    }
    motion.energy = Math.max(motion.energy, Math.min(1, energy))
    motion.lastUpdatedAt = timestamp
    motion.velocityX = velocity.x
    motion.velocityY = velocity.y
    motions.set(element, motion)
    writeMotion(motion)
    ensureAnimation()
  }

  function animate(timestamp: number) {
    animationFrame = null
    const flow = normalizeUnitStrength(toValue(options.flowStrength))
    const translation = normalizeUnitStrength(toValue(options.translationStrength))
    const energyHalfLife = flow * 560
    const velocityHalfLife = flow * 350

    for (const [element, motion] of motions) {
      if (!element.isConnected || element.dataset.glassSurfaceDynamics === undefined || !filterBindings.has(element)) {
        detachFilter(element)
        continue
      }

      const elapsed = Math.max(0, timestamp - motion.lastUpdatedAt)
      const offsetRate = translation * 0.062
      motion.offsetX += motion.velocityX * elapsed * offsetRate
      motion.offsetY += motion.velocityY * elapsed * offsetRate
      motion.energy *= flow === 0 ? 0 : 2 ** (-elapsed / energyHalfLife)
      motion.velocityX *= flow === 0 ? 0 : 2 ** (-elapsed / velocityHalfLife)
      motion.velocityY *= flow === 0 ? 0 : 2 ** (-elapsed / velocityHalfLife)
      motion.lastUpdatedAt = timestamp
      if (motion.energy < 0.006) {
        motion.energy = 0
        writeMotion(motion)
        motions.delete(element)
        continue
      }

      writeMotion(motion)
    }
    ensureAnimation()
  }

  function resolveSurface(target: EventTarget | null, clientX: number, clientY: number) {
    const targetElement = target instanceof Element ? target : document.elementFromPoint(clientX, clientY)
    let surface = targetElement?.closest<HTMLElement>(GLASS_SURFACE_QUERY) ?? null
    while (surface && surface.dataset.glassSurfaceDynamics === undefined) {
      surface = surface.parentElement?.closest<HTMLElement>(GLASS_SURFACE_QUERY) ?? null
    }

    return surface
  }

  function updateFromPoint(target: EventTarget | null, point: InputPoint) {
    const surface = resolveSurface(target, point.clientX, point.clientY)
    if (!surface) {
      previousInput = point
      return
    }

    const deltaTime = Math.max(8, point.timestamp - (previousInput?.timestamp ?? point.timestamp - 16))
    const deltaX = point.clientX - (previousInput?.clientX ?? point.clientX)
    const deltaY = point.clientY - (previousInput?.clientY ?? point.clientY)
    const velocityX = Math.max(-1, Math.min(1, deltaX / deltaTime / 1.2))
    const velocityY = Math.max(-1, Math.min(1, deltaY / deltaTime / 1.2))
    const speed = Math.hypot(deltaX, deltaY) / deltaTime
    const energy =
      POINTER_ENERGY_FLOOR + Math.min(0.8, speed * (0.34 + normalizeUnitStrength(toValue(options.flowStrength))))

    activateSurface(surface, { x: velocityX, y: velocityY }, energy, point.timestamp)
    previousInput = point
  }

  function handlePointerMove(event: PointerEvent) {
    updateFromPoint(event.target, {
      clientX: event.clientX,
      clientY: event.clientY,
      timestamp: event.timeStamp || performance.now(),
    })
  }

  function handleTouch(event: TouchEvent) {
    const touch = event.touches.item(0) ?? event.changedTouches.item(0)
    if (!touch) return
    updateFromPoint(event.target, {
      clientX: touch.clientX,
      clientY: touch.clientY,
      timestamp: event.timeStamp || performance.now(),
    })
  }

  function handleTouchEnd() {
    previousInput = null
  }

  function readScrollPosition(target: EventTarget) {
    if (target === document || target === window) return window.scrollY

    return target instanceof Element ? target.scrollTop : 0
  }

  function handleScroll(event: Event) {
    const target = event.target ?? document
    const scrollPositionKey = target === document || target === window ? window : target
    const currentPosition = readScrollPosition(target)
    const previousPosition = scrollPositions.get(scrollPositionKey) ?? 0
    scrollPositions.set(scrollPositionKey, currentPosition)
    const delta = currentPosition - previousPosition
    if (delta === 0 || reducedMotionQuery?.matches) return

    const energy = SCROLL_ENERGY_FLOOR + Math.min(0.18, Math.abs(delta) / 420)
    const timestamp = event.timeStamp || performance.now()
    let activatedSurfaces = 0
    for (const element of filterBindings.keys()) {
      if (activatedSurfaces >= getFilterBudget()) break
      activateSurface(element, { x: 0, y: Math.max(-1, Math.min(1, delta / 80)) }, energy, timestamp)
      activatedSurfaces += 1
    }
  }

  function handleResize() {
    reconcileFilterBudget()
    scheduleSurfaceSync()
  }

  function disableDynamics() {
    for (const element of [...filterBindings.keys()]) detachFilter(element)
    motions.clear()
    registry?.element.remove()
    registry = null
  }

  function handleTransparencyPreference() {
    if (!supportsGlassBackdropDisplacement()) state.value = 'unsupported'
    else state.value = reducedTransparencyQuery?.matches ? 'disabled' : 'ready'
    if (state.value !== 'ready') disableDynamics()
    else reconcileFilterBudget()
    writeRootContract()
  }

  function handleMotionPreference() {
    if (reducedMotionQuery?.matches) motions.clear()
    for (const binding of filterBindings.values()) updateFilterParameters(binding)
  }

  watchEffect(() => {
    toValue(options.routeKey)
    toValue(options.appearance)
    toValue(options.quality)
    toValue(options.deformationStrength)
    toValue(options.flowStrength)
    toValue(options.translationStrength)
    for (const binding of filterBindings.values()) updateFilterParameters(binding)
    writeRootContract()
    scheduleSurfaceSync()
  })

  onMounted(() => {
    reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedTransparencyQuery = window.matchMedia('(prefers-reduced-transparency: reduce)')
    reducedMotionQuery.addEventListener('change', handleMotionPreference)
    reducedTransparencyQuery.addEventListener('change', handleTransparencyPreference)
    handleTransparencyPreference()
    if (typeof IntersectionObserver !== 'undefined') {
      intersectionObserver = new IntersectionObserver(entries => {
        for (const entry of entries) {
          setSurfaceVisibility(
            entry.target as HTMLElement,
            entry.isIntersecting && entry.intersectionRect.width >= 1 && entry.intersectionRect.height >= 1,
          )
        }
      })
    }
    scrollPositions.set(window, window.scrollY)
    syncSurfaces()

    mutationObserver = new MutationObserver(mutations => {
      if (mutations.some(mutation => [...mutation.addedNodes, ...mutation.removedNodes].some(containsGlassSurface))) {
        scheduleSurfaceSync()
      }
    })
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    })
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('touchstart', handleTouch, { passive: true })
    window.addEventListener('touchmove', handleTouch, { passive: true })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true })
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleResize, { passive: true })
    document.addEventListener('scroll', handleScroll, { capture: true, passive: true })
  })

  onScopeDispose(() => {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame)
    if (mutationFrame !== null) cancelAnimationFrame(mutationFrame)
    mutationObserver?.disconnect()
    intersectionObserver?.disconnect()
    reducedMotionQuery?.removeEventListener('change', handleMotionPreference)
    reducedTransparencyQuery?.removeEventListener('change', handleTransparencyPreference)
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('touchstart', handleTouch)
    window.removeEventListener('touchmove', handleTouch)
    window.removeEventListener('touchend', handleTouchEnd)
    window.removeEventListener('touchcancel', handleTouchEnd)
    window.removeEventListener('scroll', handleScroll)
    window.removeEventListener('resize', handleResize)
    document.removeEventListener('scroll', handleScroll, true)
    for (const element of [...ownedSurfaces]) clearSurface(element)
    disableDynamics()
    const root = document.documentElement
    delete root.dataset.glassDynamicsQuality
    delete root.dataset.glassDynamicsState
    delete root.dataset.glassDisplacementCapability
    state.value = 'disabled'
  })

  return {
    /** 当前由统一生命周期管理的表面数量。 */
    surfaceCount,
    /** 动态位移是否可用、因偏好停用或由浏览器降级。 */
    state,
  }
}
