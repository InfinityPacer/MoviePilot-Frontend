import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

describe('glass surface public contract', () => {
  it('documents one opt-in surface attribute without the removed renderer modes', () => {
    const guide = readFileSync(resolve(cwd(), 'docs/module-federation-guide.md'), 'utf8')

    expect(guide).toContain('<div data-glass-optical-surface>')
    expect(guide).toContain('同一个可视表面只在最外层声明一次')
    expect(guide).not.toContain('data-glass-optical-mode')
    expect(guide).not.toContain('static-material')
  })

  it('keeps every public or overlay registry candidate paired with a backdrop consumer', () => {
    const dynamics = readFileSync(resolve(cwd(), 'src/composables/useGlassSurfaceDynamics.ts'), 'utf8')
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')
    const consumers = [
      { registry: '[data-glass-optical-surface]', style: '[data-glass-optical-surface]' },
      { registry: '.v-overlay__content > .v-list', style: '> :where(.v-card, .v-sheet, .v-list)' },
      { registry: '.v-snackbar__wrapper', style: '.v-snackbar__wrapper' },
      { registry: '.v-tooltip > .v-overlay__content', style: '.v-tooltip > .v-overlay__content' },
    ]

    for (const consumer of consumers) {
      expect(dynamics).toContain(`'${consumer.registry}'`)
      expect(styles).toContain(consumer.style)
    }
  })
})
