/** WebKit 稳定版尚未可靠执行 backdrop-filter 中的 SVG reference，因此只启用静态背板。 */
export function isWebKitOnlyEngine(userAgent: string) {
  return /AppleWebKit/i.test(userAgent) && !/(Chrome|Chromium|Edg|OPR)/i.test(userAgent)
}

/** Chrome 需同时通过语法探测；Safari 在经真实像素回归确认前保持静态降级。 */
export function supportsGlassBackdropDisplacement(
  css: Pick<typeof CSS, 'supports'> | undefined = typeof CSS === 'undefined' ? undefined : CSS,
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
) {
  if (!css || typeof css.supports !== 'function' || isWebKitOnlyEngine(userAgent)) return false

  const value = 'url("#mp-glass-capability-probe") blur(1px)'

  return css.supports('backdrop-filter', value) || css.supports('-webkit-backdrop-filter', value)
}
