export const GLASS_OPTICAL_STRENGTH_DEFAULT = 50
export const GLASS_OPTICAL_STRENGTH_MAX = 100
export const GLASS_OPTICAL_STRENGTH_MIN = 0
export const GLASS_OPTICAL_REFERENCE_STRENGTH = 70

export type GlassAppearance = 'clear' | 'frosted' | 'tinted'
export type GlassOpticalCapability = 'balanced' | 'css' | 'high'
export type GlassOpticalPreset = 'glide' | 'liquid' | 'natural'
export type GlassOpticalPresetKey = `${GlassAppearance}:${GlassOpticalCapability}:${GlassOpticalPreset}`
export type GlassOpticalPresetOverrides = Partial<Record<GlassOpticalPresetKey, GlassOpticalParameters>>
export type GlassOpticalQuality = 'balanced' | 'high'

export interface GlassOpticalParameters {
  /** 原生背板的局部位移幅度与噪声空间尺度。 */
  deformation: number
  /** 位移场能量、速度衰减与惯性强度。 */
  flow: number
  /** 亮边与静态镜面响应强度。 */
  reflection: number
  /** 原生背板对真实壁纸的亮度响应。 */
  transmission: number
  /** 位移噪声沿输入方向的推进距离。 */
  translation: number
  /** 壁纸可见度与材质遮罩强度。 */
  transparency: number
}

export interface GlassMaterialResponse {
  /** 表面遮罩对真实壁纸的覆盖密度。 */
  surfaceDensity: number
  /** 色调材质的主体染色密度。 */
  tintDensity: number
}

/** 将用户滑杆输入收敛到材质合同支持的整数范围，非法存量值回落到默认视觉。 */
export function normalizeGlassOpticalStrength(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return GLASS_OPTICAL_STRENGTH_DEFAULT

  return Math.min(GLASS_OPTICAL_STRENGTH_MAX, Math.max(GLASS_OPTICAL_STRENGTH_MIN, Math.round(value)))
}

type GlassOpticalPresetSet = Record<GlassOpticalPreset, GlassOpticalParameters>
type GlassOpticalCapabilityPresets = {
  balanced: GlassOpticalPresetSet
  css: Pick<GlassOpticalPresetSet, 'natural'>
  high: GlassOpticalPresetSet
}

const GLASS_OPTICAL_PRESET_MATRIX: Record<GlassAppearance, GlassOpticalCapabilityPresets> = {
  clear: {
    css: {
      natural: { deformation: 40, flow: 40, reflection: 35, transmission: 56, translation: 40, transparency: 48 },
    },
    balanced: {
      natural: { deformation: 40, flow: 40, reflection: 35, transmission: 54, translation: 40, transparency: 46 },
      glide: { deformation: 24, flow: 35, reflection: 29, transmission: 58, translation: 58, transparency: 56 },
      liquid: { deformation: 56, flow: 61, reflection: 36, transmission: 51, translation: 45, transparency: 51 },
    },
    high: {
      natural: { deformation: 40, flow: 40, reflection: 32, transmission: 53, translation: 40, transparency: 45 },
      glide: { deformation: 26, flow: 37, reflection: 28, transmission: 56, translation: 59, transparency: 54 },
      liquid: { deformation: 59, flow: 64, reflection: 35, transmission: 50, translation: 46, transparency: 50 },
    },
  },
  tinted: {
    css: {
      natural: { deformation: 40, flow: 40, reflection: 38, transmission: 54, translation: 40, transparency: 34 },
    },
    balanced: {
      natural: { deformation: 42, flow: 40, reflection: 38, transmission: 56, translation: 40, transparency: 32 },
      glide: { deformation: 26, flow: 35, reflection: 34, transmission: 61, translation: 56, transparency: 40 },
      liquid: { deformation: 58, flow: 61, reflection: 39, transmission: 53, translation: 45, transparency: 36 },
    },
    high: {
      natural: { deformation: 42, flow: 40, reflection: 35, transmission: 54, translation: 40, transparency: 30 },
      glide: { deformation: 27, flow: 37, reflection: 32, transmission: 59, translation: 58, transparency: 38 },
      liquid: { deformation: 61, flow: 64, reflection: 38, transmission: 51, translation: 46, transparency: 34 },
    },
  },
  frosted: {
    css: {
      natural: { deformation: 40, flow: 40, reflection: 31, transmission: 50, translation: 40, transparency: 31 },
    },
    balanced: {
      natural: { deformation: 46, flow: 42, reflection: 31, transmission: 52, translation: 38, transparency: 29 },
      glide: { deformation: 30, flow: 35, reflection: 27, transmission: 56, translation: 54, transparency: 40 },
      liquid: { deformation: 62, flow: 61, reflection: 32, transmission: 49, translation: 42, transparency: 34 },
    },
    high: {
      natural: { deformation: 48, flow: 42, reflection: 29, transmission: 50, translation: 38, transparency: 27 },
      glide: { deformation: 32, flow: 37, reflection: 25, transmission: 54, translation: 56, transparency: 38 },
      liquid: { deformation: 66, flow: 64, reflection: 31, transmission: 47, translation: 43, transparency: 32 },
    },
  },
}

/** 返回材质、质量与预置共同确定的六个具体参数，调用方可以安全修改返回值。 */
export function getGlassOpticalPresetParameters(
  appearance: GlassAppearance,
  quality: GlassOpticalCapability,
  preset: GlassOpticalPreset,
): GlassOpticalParameters {
  const presets = GLASS_OPTICAL_PRESET_MATRIX[appearance][quality]
  const parameters = 'natural' === preset ? presets.natural : (presets as Partial<GlassOpticalPresetSet>)[preset]

  return { ...(parameters ?? presets.natural) }
}

/** 标准档只保留自然基线；实时档同时开放滑移与液态方案。 */
export function getAvailableGlassOpticalPresets(quality: GlassOpticalCapability): GlassOpticalPreset[] {
  return quality === 'css' ? ['natural'] : ['natural', 'glide', 'liquid']
}

/** 生成持久化覆盖使用的稳定组合键；标准档始终归入自然方案。 */
export function getGlassOpticalPresetKey(
  appearance: GlassAppearance,
  quality: GlassOpticalCapability,
  preset: GlassOpticalPreset,
): GlassOpticalPresetKey {
  return `${appearance}:${quality}:${quality === 'css' ? 'natural' : preset}`
}

/** 切换组合时优先恢复用户覆盖，没有覆盖才返回预设矩阵副本。 */
export function getGlassOpticalPresetParametersWithOverrides(
  appearance: GlassAppearance,
  quality: GlassOpticalCapability,
  preset: GlassOpticalPreset,
  overrides: GlassOpticalPresetOverrides,
) {
  const key = getGlassOpticalPresetKey(appearance, quality, preset)

  return { ...(overrides[key] ?? getGlassOpticalPresetParameters(appearance, quality, preset)) }
}

const GLASS_RESPONSE_STOPS = [0, 20, 50, 70, 85, 100] as const
const GLASS_SURFACE_DENSITY: Record<GlassAppearance, readonly number[]> = {
  clear: [1, 0.88, 0.62, 0.42, 0.26, 0.18],
  tinted: [1, 0.92, 0.72, 0.52, 0.39, 0.3],
  frosted: [1, 0.96, 0.86, 0.68, 0.5, 0.4],
}
const GLASS_TINT_DENSITY = [1, 0.9, 0.65, 0.48, 0.36, 0.28] as const

/** 在相邻业务锚点之间使用零斜率边界插值，避免滑杆经过锚点时出现视觉折线。 */
function interpolateGlassResponse(value: unknown, anchors: readonly number[]) {
  const normalized = normalizeGlassOpticalStrength(value)
  const upperIndex = GLASS_RESPONSE_STOPS.findIndex(stop => normalized <= stop)
  if (upperIndex <= 0) return anchors[0]

  const lowerIndex = upperIndex - 1
  const lowerStop = GLASS_RESPONSE_STOPS[lowerIndex]
  const upperStop = GLASS_RESPONSE_STOPS[upperIndex]
  const linearProgress = (normalized - lowerStop) / (upperStop - lowerStop)
  const smoothProgress = linearProgress * linearProgress * (3 - 2 * linearProgress)

  return anchors[lowerIndex] + (anchors[upperIndex] - anchors[lowerIndex]) * smoothProgress
}

/** 一个通透度输入派生背板密度与色调密度；曝光和透射亮度不在此处计算。 */
export function getGlassMaterialResponse(appearance: GlassAppearance, value: unknown): GlassMaterialResponse {
  return {
    surfaceDensity: interpolateGlassResponse(value, GLASS_SURFACE_DENSITY[appearance]),
    tintDensity: interpolateGlassResponse(value, GLASS_TINT_DENSITY),
  }
}

/** 标准档磨砂使用独立的 surface/raised 半径锚点，不借用背景亮度制造厚度。 */
export function getGlassCssFrostBlur(value: unknown) {
  return {
    raised: interpolateGlassResponse(value, [84, 76, 62, 46, 34, 26]),
    surface: interpolateGlassResponse(value, [64, 58, 44, 30, 22, 16]),
  }
}

/** 标准 CSS 材质在壁纸归一化后只做窄幅目标亮度调整，避免重新放大原始明暗差异。 */
export function getGlassOpticalCssTransmissionBrightness(value: unknown) {
  const transmission = getGlassOpticalTransmissionStrength(value)
  if (transmission <= 1) {
    return 0.84 + 0.16 * transmission ** 1.05
  }

  const progress = (transmission - 1) / 0.3

  return 1 + 0.08 * progress ** 1.1
}

/** 原生背板以 70 为归一化目标亮度参考，并在 CSS 材质中执行窄幅亮度调整。 */
export function getGlassOpticalTransmissionStrength(value: unknown) {
  const normalized = normalizeGlassOpticalStrength(value)
  if (normalized <= GLASS_OPTICAL_REFERENCE_STRENGTH) {
    return normalized / GLASS_OPTICAL_REFERENCE_STRENGTH
  }

  const highRangeProgress =
    (normalized - GLASS_OPTICAL_REFERENCE_STRENGTH) / (GLASS_OPTICAL_STRENGTH_MAX - GLASS_OPTICAL_REFERENCE_STRENGTH)

  return 1 + 0.3 * highRangeProgress ** 1.2
}
