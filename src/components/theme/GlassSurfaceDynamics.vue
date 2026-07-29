<script setup lang="ts">
import type { ThemeCustomizerGlassAppearance } from '@/composables/useThemeCustomizer'
import { useGlassSurfaceDynamics } from '@/composables/useGlassSurfaceDynamics'
import type { GlassOpticalQuality } from '@/utils/glassOptics'

const props = defineProps<{
  /** 当前材质决定真实 backdrop 位移幅度。 */
  appearance: ThemeCustomizerGlassAppearance
  /** 用户选择的真实纹理位移强度与空间尺度。 */
  deformationStrength: number
  /** 用户选择的位移场惯性与衰减。 */
  flowStrength: number
  /** 当前位移质量；标准档不挂载该组件。 */
  quality: GlassOpticalQuality
  /** 路由变化标识，用于重新发现页面表面。 */
  routeKey: string
  /** 用户选择的位移噪声推进距离。 */
  translationStrength: number
}>()

useGlassSurfaceDynamics({
  appearance: () => props.appearance,
  deformationStrength: () => props.deformationStrength,
  flowStrength: () => props.flowStrength,
  quality: () => props.quality,
  routeKey: () => props.routeKey,
  translationStrength: () => props.translationStrength,
})
</script>

<template>
  <template v-if="false" />
</template>
