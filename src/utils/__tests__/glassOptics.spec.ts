import { describe, expect, it } from 'vitest'
import {
  getAvailableGlassOpticalPresets,
  getGlassCssFrostBlur,
  getGlassMaterialResponse,
  getGlassOpticalCssTransmissionBrightness,
  getGlassOpticalPresetKey,
  getGlassOpticalPresetParameters,
  getGlassOpticalPresetParametersWithOverrides,
  getGlassOpticalTransmissionStrength,
  normalizeGlassOpticalStrength,
} from '@/utils/glassOptics'

describe('glass material parameters', () => {
  it('normalizes persisted strength values and native backplate brightness', () => {
    expect(normalizeGlassOpticalStrength(Number.NaN)).toBe(50)
    expect(normalizeGlassOpticalStrength(-12)).toBe(0)
    expect(normalizeGlassOpticalStrength(44.6)).toBe(45)
    expect(normalizeGlassOpticalStrength(160)).toBe(100)
    expect(getGlassOpticalTransmissionStrength(0)).toBe(0)
    expect(getGlassOpticalTransmissionStrength(70)).toBe(1)
    expect(getGlassOpticalTransmissionStrength(100)).toBe(1.3)
    expect(getGlassOpticalCssTransmissionBrightness(0)).toBeCloseTo(0.84)
    expect(getGlassOpticalCssTransmissionBrightness(70)).toBeCloseTo(1)
    expect(getGlassOpticalCssTransmissionBrightness(100)).toBeCloseTo(1.08)
  })

  it('keeps presets as concrete six-parameter values', () => {
    const natural = getGlassOpticalPresetParameters('clear', 'balanced', 'natural')
    const glide = getGlassOpticalPresetParameters('clear', 'balanced', 'glide')
    const liquid = getGlassOpticalPresetParameters('frosted', 'high', 'liquid')

    expect(natural).toEqual({
      deformation: 52,
      flow: 52,
      reflection: 42,
      transmission: 65,
      translation: 52,
      transparency: 55,
    })
    expect(glide.translation).toBeGreaterThan(glide.deformation)
    expect(liquid.deformation).toBeGreaterThan(glide.deformation)
    expect(liquid.flow).toBeGreaterThan(glide.flow)
    expect(getAvailableGlassOpticalPresets('css')).toEqual(['natural'])
    expect(getAvailableGlassOpticalPresets('balanced')).toEqual(['natural', 'glide', 'liquid'])
  })

  it('keeps every preset dynamic parameter at the approved material calibration', () => {
    const expected = {
      clear: {
        css: { natural: { deformation: 52, flow: 52, translation: 52 } },
        balanced: {
          natural: { deformation: 52, flow: 52, translation: 52 },
          glide: { deformation: 31, flow: 46, translation: 75 },
          liquid: { deformation: 73, flow: 79, translation: 59 },
        },
        high: {
          natural: { deformation: 52, flow: 52, translation: 52 },
          glide: { deformation: 34, flow: 48, translation: 77 },
          liquid: { deformation: 77, flow: 83, translation: 60 },
        },
      },
      tinted: {
        css: { natural: { deformation: 52, flow: 52, translation: 52 } },
        balanced: {
          natural: { deformation: 55, flow: 52, translation: 52 },
          glide: { deformation: 34, flow: 46, translation: 73 },
          liquid: { deformation: 75, flow: 79, translation: 59 },
        },
        high: {
          natural: { deformation: 55, flow: 52, translation: 52 },
          glide: { deformation: 35, flow: 48, translation: 75 },
          liquid: { deformation: 79, flow: 83, translation: 60 },
        },
      },
      frosted: {
        css: { natural: { deformation: 52, flow: 52, translation: 52 } },
        balanced: {
          natural: { deformation: 60, flow: 55, translation: 49 },
          glide: { deformation: 39, flow: 46, translation: 70 },
          liquid: { deformation: 81, flow: 79, translation: 55 },
        },
        high: {
          natural: { deformation: 62, flow: 55, translation: 49 },
          glide: { deformation: 42, flow: 48, translation: 73 },
          liquid: { deformation: 86, flow: 83, translation: 56 },
        },
      },
    } as const

    for (const [appearance, qualities] of Object.entries(expected)) {
      for (const [quality, presets] of Object.entries(qualities)) {
        for (const [preset, parameters] of Object.entries(presets)) {
          expect(
            getGlassOpticalPresetParameters(
              appearance as 'clear' | 'frosted' | 'tinted',
              quality as 'balanced' | 'css' | 'high',
              preset as 'glide' | 'liquid' | 'natural',
            ),
          ).toMatchObject(parameters as object)
        }
      }
    }
  })

  it('restores per-combination overrides and keeps standard quality on natural', () => {
    const key = getGlassOpticalPresetKey('tinted', 'high', 'glide')
    const override = {
      deformation: 11,
      flow: 22,
      reflection: 33,
      transmission: 44,
      translation: 55,
      transparency: 66,
    }

    expect(key).toBe('tinted:high:glide')
    expect(getGlassOpticalPresetKey('frosted', 'css', 'liquid')).toBe('frosted:css:natural')
    expect(getGlassOpticalPresetParametersWithOverrides('tinted', 'high', 'glide', { [key]: override })).toEqual(
      override,
    )
    expect(getGlassOpticalPresetParametersWithOverrides('clear', 'balanced', 'natural', {})).toEqual(
      getGlassOpticalPresetParameters('clear', 'balanced', 'natural'),
    )
  })

  it('uses the approved material parameter matrix for all effective presets', () => {
    const expected = {
      clear: {
        css: { natural: [58, 67, 42] },
        balanced: { natural: [55, 65, 42], glide: [67, 70, 35], liquid: [61, 61, 43] },
        high: { natural: [54, 64, 38], glide: [65, 67, 34], liquid: [60, 60, 42] },
      },
      tinted: {
        css: { natural: [41, 65, 46] },
        balanced: { natural: [38, 67, 46], glide: [48, 73, 41], liquid: [43, 64, 47] },
        high: { natural: [36, 65, 42], glide: [46, 71, 38], liquid: [41, 61, 46] },
      },
      frosted: {
        css: { natural: [37, 60, 37] },
        balanced: { natural: [35, 62, 37], glide: [48, 67, 32], liquid: [41, 59, 38] },
        high: { natural: [32, 60, 35], glide: [46, 65, 30], liquid: [38, 56, 37] },
      },
    } as const

    for (const [appearance, qualities] of Object.entries(expected)) {
      for (const [quality, presets] of Object.entries(qualities)) {
        for (const [preset, values] of Object.entries(presets)) {
          const [transparency, transmission, reflection] = values as readonly [number, number, number]

          expect(
            getGlassOpticalPresetParameters(
              appearance as 'clear' | 'frosted' | 'tinted',
              quality as 'balanced' | 'css' | 'high',
              preset as 'glide' | 'liquid' | 'natural',
            ),
          ).toMatchObject({ reflection, transmission, transparency })
        }
      }
    }
  })

  it('derives independent material responses from piecewise smooth transparency anchors', () => {
    expect(getGlassMaterialResponse('clear', 0)).toMatchObject({
      frostBlurScale: 1.6,
      surfaceDensity: 1,
    })
    expect(getGlassMaterialResponse('tinted', 50)).toMatchObject({
      tintDensity: 0.65,
    })
    const frostedLow = getGlassMaterialResponse('frosted', 20)
    expect(frostedLow).toMatchObject({
      surfaceDensity: 0.96,
    })
    expect(getGlassMaterialResponse('frosted', 100)).toMatchObject({
      frostBlurScale: 0.52,
      surfaceDensity: 0.4,
    })
    expect(getGlassCssFrostBlur(0)).toEqual({ raised: 84, surface: 64 })
    expect(getGlassCssFrostBlur(50)).toEqual({ raised: 62, surface: 44 })
    expect(getGlassCssFrostBlur(100)).toEqual({ raised: 26, surface: 16 })

    const samples = [0, 10, 20, 35, 50, 60, 70, 78, 85, 92, 100].map(value =>
      getGlassMaterialResponse('frosted', value),
    )
    expect(
      samples.every((sample, index) => index === 0 || sample.surfaceDensity < samples[index - 1].surfaceDensity),
    ).toBe(true)
    expect(
      samples.every((sample, index) => index === 0 || sample.frostBlurScale < samples[index - 1].frostBlurScale),
    ).toBe(true)
  })

  it('returns preset copies so previews cannot mutate the shared matrix', () => {
    const first = getGlassOpticalPresetParameters('tinted', 'high', 'glide')
    first.translation = 0

    expect(getGlassOpticalPresetParameters('tinted', 'high', 'glide').translation).toBe(75)
  })
})
