import { describe, expect, it, vi } from 'vitest'
import { isWebKitOnlyEngine, supportsGlassBackdropDisplacement } from '@/utils/glassDisplacement'

describe('glass displacement capability', () => {
  it('enables Chrome only when SVG backdrop references pass syntax detection', () => {
    const css = { supports: vi.fn(() => true) }

    expect(
      supportsGlassBackdropDisplacement(css, 'Mozilla/5.0 AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36'),
    ).toBe(true)
    expect(css.supports).toHaveBeenCalled()
    expect(supportsGlassBackdropDisplacement({ supports: () => false }, 'Chrome/140.0.0.0')).toBe(false)
  })

  it('keeps Safari and other WebKit-only shells on the static native backplate', () => {
    const safari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15'
    const chromeIos =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/140.0 Mobile/15E148 Safari/604.1'

    expect(isWebKitOnlyEngine(safari)).toBe(true)
    expect(isWebKitOnlyEngine(chromeIos)).toBe(true)
    expect(supportsGlassBackdropDisplacement({ supports: () => true }, safari)).toBe(false)
    expect(supportsGlassBackdropDisplacement({ supports: () => true }, chromeIos)).toBe(false)
  })
})
