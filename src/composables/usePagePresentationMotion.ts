import { readonly, ref } from 'vue'

export const PAGE_PRESENTATION_MOTION_DURATION_MS = 180
export const PAGE_PRESENTATION_MOTION_START_OPACITY = 0.88
export const PAGE_PRESENTATION_MOTION_START_TRANSLATE_Y = 4
export const PAGE_PRESENTATION_LAYOUT_STABLE_MS = 120
export const PAGE_PRESENTATION_LAYOUT_HOLD_MAX_MS = 480

const active = ref(false)
const epoch = ref(0)
const opacity = ref(1)
const progress = ref(1)
const routeKey = ref('')
const translateY = ref(0)
let animationFrame: number | null = null
let layoutHoldStartedAt = 0
let layoutStableSince = 0
let layoutSignature = ''
let startedAt = 0

function sampleBezier(time: number, start: number, end: number) {
  const inverse = 1 - time

  return 3 * inverse * inverse * time * start + 3 * inverse * time * time * end + time * time * time
}

/** 计算玻璃页面统一使用的 `cubic-bezier(0.2, 0.8, 0.2, 1)` 进度。 */
export function getPagePresentationMotionProgress(elapsed: number, duration = PAGE_PRESENTATION_MOTION_DURATION_MS) {
  if (duration <= 0 || elapsed >= duration) return 1
  if (elapsed <= 0) return 0

  const target = elapsed / duration
  let lower = 0
  let upper = 1
  let parameter = target

  for (let iteration = 0; iteration < 10; iteration += 1) {
    parameter = (lower + upper) * 0.5
    if (sampleBezier(parameter, 0.2, 0.2) < target) lower = parameter
    else upper = parameter
  }

  return sampleBezier(parameter, 0.8, 1)
}

function clearDocumentMotionState() {
  const root = document.documentElement
  delete root.dataset.pagePresentationMotion
  root.style.removeProperty('--mp-page-motion-opacity')
  root.style.removeProperty('--mp-page-motion-translate-y')
}

/** 将页面入场状态原子写入根节点，避免透明度与位移跨帧更新。 */
function applyMotionFrame(nextProgress: number) {
  const root = document.documentElement
  const nextOpacity =
    PAGE_PRESENTATION_MOTION_START_OPACITY + (1 - PAGE_PRESENTATION_MOTION_START_OPACITY) * nextProgress
  const nextTranslateY = PAGE_PRESENTATION_MOTION_START_TRANSLATE_Y * (1 - nextProgress)

  root.dataset.pagePresentationMotion = 'active'
  root.style.setProperty('--mp-page-motion-opacity', nextOpacity.toFixed(4))
  root.style.setProperty('--mp-page-motion-translate-y', `${nextTranslateY.toFixed(3)}px`)
  opacity.value = nextOpacity
  progress.value = nextProgress
  translateY.value = nextTranslateY
}

/** 布局门关闭时不暴露尚未稳定的页面几何。 */
function applyLayoutHoldFrame() {
  const root = document.documentElement

  root.dataset.pagePresentationMotion = 'active'
  root.style.setProperty('--mp-page-motion-opacity', '0')
  root.style.setProperty('--mp-page-motion-translate-y', `${PAGE_PRESENTATION_MOTION_START_TRANSLATE_Y}px`)
  opacity.value = 0
  progress.value = 0
  translateY.value = PAGE_PRESENTATION_MOTION_START_TRANSLATE_Y
}

function getLayoutSignature(root: HTMLElement) {
  return `${root.offsetWidth},${root.offsetHeight},${root.scrollWidth},${root.scrollHeight}`
}

function beginReveal(timestamp: number, motionEpoch: number) {
  if (!active.value || epoch.value !== motionEpoch) return

  startedAt = timestamp
  applyMotionFrame(0)
  animationFrame = window.requestAnimationFrame(nextTimestamp => renderFrame(nextTimestamp, motionEpoch))
}

/** 页面根持续稳定后才开始 reveal；上限避免持续布局页面永久不可见。 */
function sampleLayoutHold(timestamp: number, motionEpoch: number, root: HTMLElement) {
  if (!active.value || epoch.value !== motionEpoch) return
  animationFrame = null

  const nextSignature = getLayoutSignature(root)
  if (nextSignature !== layoutSignature) {
    layoutSignature = nextSignature
    layoutStableSince = timestamp
  }

  if (
    timestamp - layoutStableSince >= PAGE_PRESENTATION_LAYOUT_STABLE_MS ||
    timestamp - layoutHoldStartedAt >= PAGE_PRESENTATION_LAYOUT_HOLD_MAX_MS
  ) {
    beginReveal(timestamp, motionEpoch)
    return
  }

  animationFrame = window.requestAnimationFrame(nextTimestamp => sampleLayoutHold(nextTimestamp, motionEpoch, root))
}

function settleMotion() {
  active.value = false
  opacity.value = 1
  progress.value = 1
  translateY.value = 0
  clearDocumentMotionState()
}

function cancel() {
  const needsCancellation =
    active.value ||
    opacity.value !== 1 ||
    translateY.value !== 0 ||
    document.documentElement.dataset.pagePresentationMotion === 'active'

  if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
  animationFrame = null
  if (needsCancellation) epoch.value += 1
  settleMotion()
}

function renderFrame(timestamp: number, motionEpoch: number) {
  if (!active.value || epoch.value !== motionEpoch) return
  animationFrame = null

  const nextProgress = getPagePresentationMotionProgress(timestamp - startedAt)
  applyMotionFrame(nextProgress)
  if (nextProgress < 1) {
    animationFrame = window.requestAnimationFrame(nextTimestamp => renderFrame(nextTimestamp, motionEpoch))
    return
  }

  settleMotion()
}

/**
 * 玻璃主题由共享控制器接管页面入场；其他主题继续使用既有 CSS keyframe。
 * 返回 true 表示本次路由变化已经处理，包括 reduced-motion 的即时提交。
 */
function start(nextRouteKey: string, layoutRoot?: HTMLElement | null) {
  if (document.documentElement.dataset.theme !== 'glass') {
    cancel()
    return false
  }

  if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
  animationFrame = null
  epoch.value += 1
  const motionEpoch = epoch.value
  routeKey.value = nextRouteKey

  // 启动屏已完整遮罩页面；在其背后再等待布局稳定会把一次启动拆成两次可见揭示。
  if (document.documentElement.dataset.launchLoading === 'true' && document.getElementById('loading-bg')) {
    settleMotion()
    return true
  }

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    settleMotion()
    return true
  }

  active.value = true
  const timestamp = performance.now()
  if (layoutRoot) {
    layoutHoldStartedAt = timestamp
    layoutStableSince = timestamp
    layoutSignature = getLayoutSignature(layoutRoot)
    applyLayoutHoldFrame()
    animationFrame = window.requestAnimationFrame(nextTimestamp =>
      sampleLayoutHold(nextTimestamp, motionEpoch, layoutRoot),
    )
  } else {
    beginReveal(timestamp, motionEpoch)
  }

  return true
}

/** 提供玻璃主题默认布局使用的短时页面呈现事务。 */
export function usePagePresentationMotion() {
  return {
    active: readonly(active),
    cancel,
    epoch: readonly(epoch),
    opacity: readonly(opacity),
    progress: readonly(progress),
    routeKey: readonly(routeKey),
    start,
    translateY: readonly(translateY),
  }
}
