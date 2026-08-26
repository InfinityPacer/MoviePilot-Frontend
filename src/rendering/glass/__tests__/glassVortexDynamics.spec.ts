import { describe, expect, it } from 'vitest'
import {
  getGlassVortexCoreDecay,
  getGlassVortexDirection,
  GLASS_VORTEX_ARC_DRIVE_GAIN,
  GLASS_VORTEX_CAUSTIC_GAIN,
  GLASS_VORTEX_CORE_DECAY,
  GLASS_VORTEX_CORE_RADIUS,
  GLASS_VORTEX_DRIVE_GAIN,
  GLASS_VORTEX_FRAGMENT_FIELD,
  GLASS_VORTEX_INWARD_PULL,
  GLASS_VORTEX_MAX_CORES,
  GLASS_VORTEX_OUTER_RADIUS,
  GLASS_VORTEX_SHADOW_GAIN,
} from '@/rendering/glass/glassVortexDynamics'

describe('glass vortex dynamics', () => {
  it.each([
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [0.7, 0.4],
  ])('keeps the local response tangential at delta (%s, %s)', (deltaX, deltaY) => {
    const direction = getGlassVortexDirection(deltaX, deltaY)

    expect(Math.abs(direction.tangential)).toBeGreaterThan(Math.abs(direction.radial))
    expect(direction.tangential).toBeCloseTo(1)
    expect(direction.radial).toBeCloseTo(-GLASS_VORTEX_INWARD_PULL)
  })

  it('uses a neutral center and fixed geometry across quality tiers', () => {
    expect(getGlassVortexDirection(0, 0)).toEqual({ radial: 0, tangential: 0, x: 0, y: 0 })
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain(`float vortexCoreRadius = ${GLASS_VORTEX_CORE_RADIUS.toFixed(3)}`)
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain(`float vortexOuterRadius = ${GLASS_VORTEX_OUTER_RADIUS.toFixed(3)}`)
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain(`float inwardPull = ${GLASS_VORTEX_INWARD_PULL.toFixed(2)}`)
    expect(GLASS_VORTEX_FRAGMENT_FIELD).not.toContain('vortexOuterRadius = mix')
    expect(GLASS_VORTEX_FRAGMENT_FIELD).not.toContain('vortexCoreRadius = mix')
    expect(GLASS_VORTEX_FRAGMENT_FIELD).not.toContain('uMotionExpansion')
  })

  it('keeps two to three similarly sized cores in strictly decaying age order', () => {
    const weights = Array.from({ length: GLASS_VORTEX_MAX_CORES }, (_, index) => getGlassVortexCoreDecay(index))

    expect(GLASS_VORTEX_MAX_CORES).toBe(3)
    expect(weights[0]).toBe(1)
    expect(weights[0]).toBeGreaterThan(weights[1])
    expect(weights[1]).toBeGreaterThan(weights[2])
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain(
      `for (int vortexIndex = 0; vortexIndex < ${GLASS_VORTEX_MAX_CORES}; vortexIndex++)`,
    )
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain('if (vortexIndex >= uTrailCount) break')
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain(`exp2(-float(vortexIndex) * ${GLASS_VORTEX_CORE_DECAY.toFixed(2)})`)
    expect(GLASS_VORTEX_FRAGMENT_FIELD).not.toContain('mix(1.0, 0.68')
  })

  it('builds a fixed-direction tangential core and one-sided caustic arc without a wavefront', () => {
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain('const float rotationSign = 1.0')
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain('rotationSign * vec2(-vortexRadial.y, vortexRadial.x)')
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain('clamp(vortexTrail.z, 0.0, 1.0) * coreAge * annulus')
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain('vortexTangent - vortexRadial * inwardPull')
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain('atan(vortexRadial.y, vortexRadial.x) - rotationSign')
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain('float arcSignal = cos(spiralPhase)')
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain('smoothstep(0.42, 0.94, arcSignal)')
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain('smoothstep(0.42, 0.94, -arcSignal)')
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain(
      `float spiralDrive = mix(0.62, ${GLASS_VORTEX_ARC_DRIVE_GAIN.toFixed(2)}, angularArc)`,
    )
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain('trailWeight * spiralDrive')
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain(
      `arcBand * angularArc * ${GLASS_VORTEX_CAUSTIC_GAIN.toFixed(1)} * uMotion`,
    )
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain(
      `arcBand * opposingArc * ${GLASS_VORTEX_SHADOW_GAIN.toFixed(2)} * uMotion`,
    )
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain('min(uMaxRefractionPixels, mix(10.0, 13.0, uQuality))')
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain(`vortexStrength * ${GLASS_VORTEX_DRIVE_GAIN.toFixed(2)}`)
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain('smoothstep(vortexCoreRadius * 0.45, vortexCoreRadius')
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain('1.0 - smoothstep(vortexOuterRadius * 0.58, vortexOuterRadius')
    expect(GLASS_VORTEX_FRAGMENT_FIELD).not.toContain('uRippleTexture')
    expect(GLASS_VORTEX_FRAGMENT_FIELD).not.toContain('rippleGradient')
    expect(GLASS_VORTEX_FRAGMENT_FIELD).not.toContain('uStep')
  })

  it('caps overlap energy instead of inflating the field by summing core weights', () => {
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain(
      'float vortexFieldStrength = min(length(accumulatedVortex), vortexPeak * 1.2)',
    )
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain('vortexEnergy = clamp(vortexPeak * uMotion')
    expect(GLASS_VORTEX_FRAGMENT_FIELD).not.toContain('accumulatedWeight')
  })

  it('uses the shared high-tier flow field only as an inertia scalar', () => {
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain('texture2D(uFlowTexture, vUv).z')
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain('float temporalBoost = 1.0 + temporalEnergy * 0.38')
    expect(GLASS_VORTEX_FRAGMENT_FIELD).not.toContain('flowSample.xy')
    expect(GLASS_VORTEX_FRAGMENT_FIELD).not.toContain('temporalCurl')
    expect(GLASS_VORTEX_FRAGMENT_FIELD).not.toContain('uPointerVelocity')
  })

  it('keeps deformation, envelope and curl controls distinct', () => {
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain('float deformationDrive =')
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain('float flowEnvelope =')
    expect(GLASS_VORTEX_FRAGMENT_FIELD).toContain('float translationCurl =')
    expect(GLASS_VORTEX_FRAGMENT_FIELD).not.toContain('uTranslationStrength * uDeformationStrength * uFlowStrength')
  })
})
