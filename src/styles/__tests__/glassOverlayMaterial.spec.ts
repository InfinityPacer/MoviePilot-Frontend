import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

describe('glass overlay material styles', () => {
  it('keeps overlays translucent enough for CSS backdrop compositing in every material', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')

    expect(styles).toContain('calc(0.1 + var(--glass-surface-density, 0.62) * 0.22)')
    expect(styles).toContain('--glass-overlay-blur: 3px')
    expect(styles).toContain('--glass-overlay-saturate: 115%')
    expect(styles).toContain('--glass-overlay-blur: 12px')
    expect(styles).toContain('--glass-overlay-saturate: 120%')
    expect(styles).toContain('--glass-overlay-blur: min(var(--glass-native-raised-blur), 36px)')
    expect(styles).toContain('--glass-overlay-saturate: 135%')
    expect(styles).toContain('--glass-overlay-scrim: rgba(3, 7, 18, 30%)')
    expect(styles).toContain('--glass-overlay-scrim: rgba(3, 7, 18, 32%)')
    expect(styles).toContain('--glass-overlay-scrim: rgba(3, 7, 18, 36%)')
    expect(styles).toContain('calc(0.06 + var(--glass-surface-density, 0.86) * 0.12)')
    expect(styles).not.toContain('calc(0.64 + var(--glass-surface-density, 0.86) * 0.16)')
    expect(styles).not.toContain('background: rgba(3, 7, 18, 62%)')
  })

  it('composites glass dialogs at their final geometry instead of resampling a scaled backdrop', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')

    expect(styles).toMatch(
      /\.v-overlay__content\.mp-dialog-transition-enter-active[\s\S]*?transition:\s*opacity 120ms var\(--mp-motion-ease-standard\);/,
    )
    expect(styles).toMatch(
      /\.v-overlay__content\.mp-dialog-transition-enter-from[\s\S]*?filter:\s*none;[\s\S]*?transform:\s*none;/,
    )
  })

  it('keeps the fixed navigation backdrop isolated from route content and its scrollbar', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')

    expect(styles).toContain('--glass-fixed-shell-backdrop-filter: blur(min(var(--glass-native-raised-blur), 60px))')
    expect(styles).toMatch(
      /\.layout-vertical-nav\s*\{[\s\S]*?isolation:\s*isolate;[\s\S]*?backdrop-filter:\s*none;[\s\S]*?&::before\s*\{[\s\S]*?backdrop-filter:\s*var\(--glass-fixed-shell-filter-chain, var\(--glass-fixed-shell-backdrop-filter\)\);/,
    )
    expect(styles).toMatch(/\.layout-vertical-nav \.ps__rail-y\s*\{[\s\S]*?inset-inline-end:\s*0\.5rem !important;/)
  })

  it('uses the shared hover-card contract instead of a Dashboard-specific shadow rule', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')

    expect(styles).toContain('.app-hover-lift-card:is(:hover, .app-hover-lift-card--hovering)')
    expect(styles).not.toContain(
      '.dashboard-grid-item-content .app-hover-lift-card:is(:hover, .app-hover-lift-card--hovering)',
    )
  })

  it('applies surface-local displacement inside the native backdrop filter chain', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')

    expect(styles).toContain('--glass-surface-backdrop-filter: brightness(var(--glass-transmission-brightness))')
    expect(styles).toMatch(
      /\[data-glass-surface-dynamics\]\s*\{[\s\S]*?--glass-surface-filter-chain:\s*var\(--glass-surface-displacement-filter, brightness\(1\)\)\s*var\(--glass-surface-backdrop-filter\);/,
    )
    expect(styles).toContain('--glass-overlay-filter-chain: var(--glass-surface-displacement-filter, brightness(1))')
    expect(styles).toContain('--glass-dashboard-filter-chain: var(--glass-surface-displacement-filter, brightness(1))')
    expect(styles).toMatch(
      /\.login-card__surface\s*\{[\s\S]*?-webkit-backdrop-filter:\s*var\(--glass-surface-filter-chain/,
    )
    expect(styles).toMatch(
      /:where\([\s\S]*?\.v-card[\s\S]*?\)\s*\{[\s\S]*?-webkit-backdrop-filter:\s*var\(--glass-surface-filter-chain/,
    )
    expect(styles).not.toContain('[data-glass-surface-dynamics]::after')
    expect(styles).not.toContain('--glass-dynamics-x')
    expect(styles).not.toContain('--glass-dynamics-tail-x')
    expect(styles).not.toContain('conic-gradient(')
    expect(styles).not.toContain('.glass-optical-layer')
    expect(styles).not.toContain('data-glass-renderer-state')
  })

  it('keeps controls and nested containers out of the top-level backdrop sampling chain', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')

    expect(styles).toContain('--glass-control-prominent-backdrop-filter: none')
    expect(styles).not.toContain('--glass-control-prominent-backdrop-filter: blur(')
    expect(styles).toMatch(
      /\[data-glass-surface-dynamics\][\s\S]*?:where\([\s\S]*?\.search-input-wrapper,[\s\S]*?\.native-login-field,[\s\S]*?\.v-field,[\s\S]*?\.v-btn,[\s\S]*?\)\s*\{[\s\S]*?backdrop-filter:\s*none !important;/,
    )
  })

  it('keeps frosted optical qualities distinct from the standard native material', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')

    expect(styles).toMatch(
      /\[data-glass-appearance='frosted'\]\[data-glass-dynamics-quality='balanced'\][\s\S]*?--glass-native-surface-blur:\s*calc\(16px \* var\(--glass-frost-blur-scale, 1\)\);/,
    )
    expect(styles).toMatch(
      /\[data-glass-appearance='frosted'\]\[data-glass-dynamics-quality='high'\][\s\S]*?--glass-native-surface-blur:\s*calc\(10px \* var\(--glass-frost-blur-scale, 1\)\);/,
    )
    expect(styles).toContain('--glass-native-raised-blur: calc(24px * var(--glass-frost-blur-scale, 1))')
    expect(styles).toContain('--glass-native-raised-blur: calc(16px * var(--glass-frost-blur-scale, 1))')
    expect(styles).toContain('--glass-blur-surface: 40px')
  })
})
