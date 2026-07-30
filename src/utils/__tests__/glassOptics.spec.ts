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
      deformation: 40,
      flow: 40,
      reflection: 35,
      transmission: 54,
      translation: 40,
      transparency: 46,
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
        css: { natural: { deformation: 40, flow: 40, translation: 40 } },
        balanced: {
          natural: { deformation: 40, flow: 40, translation: 40 },
          glide: { deformation: 24, flow: 35, translation: 58 },
          liquid: { deformation: 56, flow: 61, translation: 45 },
        },
        high: {
          natural: { deformation: 40, flow: 40, translation: 40 },
          glide: { deformation: 26, flow: 37, translation: 59 },
          liquid: { deformation: 59, flow: 64, translation: 46 },
        },
      },
      tinted: {
        css: { natural: { deformation: 40, flow: 40, translation: 40 } },
        balanced: {
          natural: { deformation: 42, flow: 40, translation: 40 },
          glide: { deformation: 26, flow: 35, translation: 56 },
          liquid: { deformation: 58, flow: 61, translation: 45 },
        },
        high: {
          natural: { deformation: 42, flow: 40, translation: 40 },
          glide: { deformation: 27, flow: 37, translation: 58 },
          liquid: { deformation: 61, flow: 64, translation: 46 },
        },
      },
      frosted: {
        css: { natural: { deformation: 40, flow: 40, translation: 40 } },
        balanced: {
          natural: { deformation: 46, flow: 42, translation: 38 },
          glide: { deformation: 30, flow: 35, translation: 54 },
          liquid: { deformation: 62, flow: 61, translation: 42 },
        },
        high: {
          natural: { deformation: 48, flow: 42, translation: 38 },
          glide: { deformation: 32, flow: 37, translation: 56 },
          liquid: { deformation: 66, flow: 64, translation: 43 },
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

  it('uses the approved transparency and transmission matrix for all effective presets', () => {
    const expected = {
      clear: {
        css: { natural: [48, 56] },
        balanced: { natural: [46, 54], glide: [56, 58], liquid: [51, 51] },
        high: { natural: [45, 53], glide: [54, 56], liquid: [50, 50] },
      },
      tinted: {
        css: { natural: [34, 54] },
        balanced: { natural: [32, 56], glide: [40, 61], liquid: [36, 53] },
        high: { natural: [30, 54], glide: [38, 59], liquid: [34, 51] },
      },
      frosted: {
        css: { natural: [31, 50] },
        balanced: { natural: [29, 52], glide: [40, 56], liquid: [34, 49] },
        high: { natural: [27, 50], glide: [38, 54], liquid: [32, 47] },
      },
    } as const

    for (const [appearance, qualities] of Object.entries(expected)) {
      for (const [quality, presets] of Object.entries(qualities)) {
        for (const [preset, values] of Object.entries(presets)) {
          const [transparency, transmission] = values as readonly [number, number]

          expect(
            getGlassOpticalPresetParameters(
              appearance as 'clear' | 'frosted' | 'tinted',
              quality as 'balanced' | 'css' | 'high',
              preset as 'glide' | 'liquid' | 'natural',
            ),
          ).toMatchObject({ transmission, transparency })
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

    expect(getGlassOpticalPresetParameters('tinted', 'high', 'glide').translation).toBe(58)
  })
})
