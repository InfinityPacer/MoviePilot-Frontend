export const GLASS_VORTEX_CORE_RADIUS = 0.012
export const GLASS_VORTEX_OUTER_RADIUS = 0.066
export const GLASS_VORTEX_INWARD_PULL = 0.06
export const GLASS_VORTEX_CORE_DECAY = 0.62
export const GLASS_VORTEX_MAX_CORES = 3
export const GLASS_VORTEX_DRIVE_GAIN = 2.6
export const GLASS_VORTEX_CAUSTIC_GAIN = 3.2
export const GLASS_VORTEX_ARC_DRIVE_GAIN = 1.32
export const GLASS_VORTEX_SHADOW_GAIN = 0.78

/** 返回第 index 个涡核的年龄权重；旧涡核必须保持单调衰减。 */
export function getGlassVortexCoreDecay(index: number) {
  return Math.pow(2, -Math.max(0, index) * GLASS_VORTEX_CORE_DECAY)
}

/** 返回涡核在采样点的切向与径向分量，用于约束各质量档共享的旋转身份。 */
export function getGlassVortexDirection(deltaX: number, deltaY: number) {
  const radius = Math.hypot(deltaX, deltaY)
  if (radius <= Number.EPSILON) return { radial: 0, tangential: 0, x: 0, y: 0 }

  const radialX = deltaX / radius
  const radialY = deltaY / radius
  const tangentX = -radialY
  const tangentY = radialX
  const x = tangentX - radialX * GLASS_VORTEX_INWARD_PULL
  const y = tangentY - radialY * GLASS_VORTEX_INWARD_PULL

  return {
    radial: x * radialX + y * radialY,
    tangential: x * tangentX + y * tangentY,
    x,
    y,
  }
}

/**
 * Vortex 将现有指针轨迹解析为多个同向衰减涡核。
 * Balanced 只消费主材质已有 uniforms；High 只读取 Fluid flowmap 的能量通道补充惯性。
 */
export const GLASS_VORTEX_FRAGMENT_FIELD = `  vec2 vortexRefraction = vec2(0.0);
  float vortexEnergy = 0.0;
  float vortexCaustic = 0.0;
  float vortexShadow = 0.0;
  if (vortexMode > 0.5) {
    vec2 vortexAspect = uPresentationSize / max(uVisibleViewportSize.y, 1.0);
    float vortexOuterRadius = ${GLASS_VORTEX_OUTER_RADIUS.toFixed(3)};
    float vortexCoreRadius = ${GLASS_VORTEX_CORE_RADIUS.toFixed(3)};
    float deformationDrive = clamp(uDeformationStrength / 1.55, 0.0, 1.0);
    float flowEnvelope = clamp(uFlowStrength / 1.45, 0.0, 1.0);
    float translationCurl = mix(0.78, 1.18, clamp(uTranslationStrength / 1.7, 0.0, 1.0));
    float vortexStrength = deformationDrive * mix(0.62, 1.0, flowEnvelope) * translationCurl;
    vec2 accumulatedVortex = vec2(0.0);
    float vortexPeak = 0.0;
    const float rotationSign = 1.0;

    for (int vortexIndex = 0; vortexIndex < ${GLASS_VORTEX_MAX_CORES}; vortexIndex++) {
      if (vortexIndex >= uTrailCount) break;

      vec4 vortexTrail = uTrail[vortexIndex];
      vec2 vortexDelta = vUv - vortexTrail.xy;
      vortexDelta *= vortexAspect;
      float vortexRadius = length(vortexDelta);
      vec2 vortexRadial = vortexDelta / max(vortexRadius, 0.0001);
      vec2 vortexTangent = rotationSign * vec2(-vortexRadial.y, vortexRadial.x);
      float coreAge = exp2(-float(vortexIndex) * ${GLASS_VORTEX_CORE_DECAY.toFixed(2)});
      float annulus =
        smoothstep(vortexCoreRadius * 0.45, vortexCoreRadius, vortexRadius) *
        (1.0 - smoothstep(vortexOuterRadius * 0.58, vortexOuterRadius, vortexRadius));
      float radialProgress = clamp(
        (vortexRadius - vortexCoreRadius) /
        max(vortexOuterRadius - vortexCoreRadius, 0.0001),
        0.0,
        1.0
      );
      float spiralPhase =
        atan(vortexRadial.y, vortexRadial.x) - rotationSign * (0.35 + radialProgress * 4.4);
      float arcSignal = cos(spiralPhase);
      float angularArc = smoothstep(0.42, 0.94, arcSignal);
      float opposingArc = smoothstep(0.42, 0.94, -arcSignal);
      float arcBand =
        smoothstep(vortexCoreRadius * 1.1, vortexCoreRadius * 1.6, vortexRadius) *
        (1.0 - smoothstep(vortexOuterRadius * 0.55, vortexOuterRadius * 0.78, vortexRadius));
      float trailWeight = clamp(vortexTrail.z, 0.0, 1.0) * coreAge * annulus;
      float spiralDrive = mix(0.62, ${GLASS_VORTEX_ARC_DRIVE_GAIN.toFixed(2)}, angularArc);
      float inwardPull = ${GLASS_VORTEX_INWARD_PULL.toFixed(2)};

      accumulatedVortex += (vortexTangent - vortexRadial * inwardPull) * trailWeight * spiralDrive;
      vortexPeak = max(vortexPeak, trailWeight);
      vortexCaustic = max(
        vortexCaustic,
        clamp(vortexTrail.z, 0.0, 1.0) * coreAge * arcBand * angularArc * ${GLASS_VORTEX_CAUSTIC_GAIN.toFixed(1)} * uMotion
      );
      vortexShadow = max(
        vortexShadow,
        clamp(vortexTrail.z, 0.0, 1.0) * coreAge * arcBand * opposingArc * ${GLASS_VORTEX_SHADOW_GAIN.toFixed(2)} * uMotion
      );
    }

    float temporalEnergy =
      uHasFlowTexture > 0.5
        ? clamp(texture2D(uFlowTexture, vUv).z, 0.0, 1.0)
        : 0.0;
    float vortexFieldStrength = min(length(accumulatedVortex), vortexPeak * 1.2);
    vec2 vortexDirection =
      vortexFieldStrength > 0.0001 ? accumulatedVortex / max(length(accumulatedVortex), 0.0001) : vec2(0.0);
    float temporalBoost = 1.0 + temporalEnergy * 0.38;
    float vortexDrive = clamp(
      vortexFieldStrength * uMotion * vortexStrength * ${GLASS_VORTEX_DRIVE_GAIN.toFixed(2)} * temporalBoost,
      0.0,
      1.0
    );
    float maxVortexPixels = min(uMaxRefractionPixels, mix(10.0, 13.0, uQuality));

    vortexRefraction =
      vortexDirection * vortexDrive * maxVortexPixels /
      max(uPresentationSize, vec2(1.0));
    vortexEnergy = clamp(vortexPeak * uMotion * vortexStrength * temporalBoost, 0.0, 1.0);
  }`
