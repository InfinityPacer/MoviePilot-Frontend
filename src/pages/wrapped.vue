<script setup lang="ts">
import api from '@/api'
import type {
  WrappedAvailability,
  WrappedHighlight,
  WrappedHighlights,
  WrappedMetric,
  WrappedMetricCard,
  WrappedOverview,
  WrappedRange,
  WrappedRankings,
  WrappedRebuildStatus,
  WrappedSeries,
} from '@/api/types'
import { formatBytes } from '@/@core/utils/formatters'
import { useTheme } from 'vuetify'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

// Vuetify 主题，用于让图表颜色与当前主题一致
const vuetifyTheme = useTheme()

// Wrapped 时间范围选项
const rangeOptions: { title: string; value: WrappedRange }[] = [
  { title: '日', value: 'day' },
  { title: '周', value: 'week' },
  { title: '月', value: 'month' },
  { title: '年', value: 'year' },
  { title: '全历史', value: 'all' },
]

// Wrapped 主指标选项
const metricOptions: { title: string; value: WrappedMetric; icon: string }[] = [
  { title: '下载数', value: 'download', icon: 'mdi-download-outline' },
  { title: '整理数', value: 'transfer', icon: 'mdi-folder-sync-outline' },
  { title: '成功率', value: 'success_rate', icon: 'mdi-check-decagram-outline' },
  { title: '存储', value: 'storage_used', icon: 'mdi-harddisk' },
  { title: '媒体库', value: 'library_total', icon: 'mdi-movie-open-outline' },
]

// 当前选中的时间范围
const currentRange = ref<WrappedRange>('month')

// 当前选中的曲线指标
const currentMetric = ref<WrappedMetric>('transfer')

// Wrapped 页面加载状态
const loading = ref(false)

// Wrapped 重建触发状态
const rebuilding = ref(false)

// Wrapped 总览数据
const overview = ref<WrappedOverview>()

// Wrapped 曲线数据
const seriesData = ref<WrappedSeries>()

// Wrapped 榜单数据
const rankings = ref<WrappedRankings>()

// Wrapped 高光数据
const highlights = ref<WrappedHighlights>()

// Wrapped 能力数据
const availability = ref<WrappedAvailability>()

// Wrapped 重建状态
const rebuildStatus = ref<WrappedRebuildStatus>()

// 图表配置，随主题变化更新颜色
const chartOptions = computed(() => {
  const theme = vuetifyTheme.current.value.colors
  return {
    chart: {
      toolbar: { show: false },
      zoom: { enabled: false },
    },
    stroke: {
      curve: 'smooth',
      width: 3,
    },
    dataLabels: { enabled: false },
    grid: {
      borderColor: 'rgba(var(--v-border-color), var(--v-border-opacity))',
      strokeDashArray: 6,
    },
    colors: [theme.primary],
    xaxis: {
      categories: seriesData.value?.series.map(item => item.bucket.slice(5)) ?? [],
      labels: {
        rotate: -20,
        trim: true,
      },
    },
    yaxis: {
      labels: {
        formatter: (value: number) => formatMetricValue(currentMetric.value, value, true),
      },
    },
    tooltip: {
      y: {
        formatter: (value: number) => formatMetricValue(currentMetric.value, value),
      },
    },
  }
})

// ApexCharts 曲线序列
const chartSeries = computed(() => [
  {
    name: metricOptions.find(item => item.value === currentMetric.value)?.title ?? '',
    data: seriesData.value?.series.map(item => item.value ?? null) ?? [],
  },
])

// 当前范围下可展示的高光列表
const visibleHighlights = computed<WrappedHighlight[]>(() => highlights.value?.highlights ?? [])

// 加载 Wrapped 全页面数据
async function loadWrappedData() {
  loading.value = true
  try {
    const [overviewRes, seriesRes, rankingsRes, highlightsRes, availabilityRes, statusRes] = (await Promise.all([
      api.get('wrapped/overview', { params: { range: currentRange.value } }),
      api.get('wrapped/series', { params: { range: currentRange.value, metric: currentMetric.value } }),
      api.get('wrapped/rankings', { params: { range: currentRange.value } }),
      api.get('wrapped/highlights', { params: { range: currentRange.value } }),
      api.get('wrapped/availability'),
      api.get('wrapped/rebuild/status'),
    ]) as unknown) as [
      WrappedOverview,
      WrappedSeries,
      WrappedRankings,
      WrappedHighlights,
      WrappedAvailability,
      WrappedRebuildStatus,
    ]
    overview.value = overviewRes
    seriesData.value = seriesRes
    rankings.value = rankingsRes
    highlights.value = highlightsRes
    availability.value = availabilityRes
    rebuildStatus.value = statusRes
  } finally {
    loading.value = false
  }
}

// 触发 Wrapped 行为历史和媒体库画像重建
async function rebuildWrapped() {
  rebuilding.value = true
  try {
    rebuildStatus.value = (await api.post('wrapped/rebuild', {
      include_behavior: true,
      include_catalog: true,
      force: false,
    })) as WrappedRebuildStatus
  } finally {
    rebuilding.value = false
  }
}

// 导出当前范围的 Wrapped 长图
function exportPoster() {
  const canvas = document.createElement('canvas')
  const width = 1080
  const height = 1600
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = '#101418'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 64px sans-serif'
  ctx.fillText('MoviePilot Wrapped', 72, 120)
  ctx.font = '400 30px sans-serif'
  ctx.fillStyle = '#b7c2cc'
  ctx.fillText(`范围：${rangeOptions.find(item => item.value === currentRange.value)?.title ?? ''}`, 72, 176)

  let top = 260
  ;(overview.value?.cards ?? []).slice(0, 5).forEach(card => {
    ctx.fillStyle = '#27313a'
    ctx.fillRect(72, top, 420, 150)
    ctx.fillStyle = '#ffffff'
    ctx.font = '600 32px sans-serif'
    ctx.fillText(card.title, 104, top + 48)
    ctx.font = '700 46px sans-serif'
    ctx.fillText(formatCardValue(card), 104, top + 112)
    top += 184
  })

  ctx.fillStyle = '#b7c2cc'
  ctx.font = '400 26px sans-serif'
  const note = seriesData.value?.metric_meta.data_quality_note ?? '不同指标使用独立历史口径。'
  ctx.fillText(note.slice(0, 34), 72, height - 96)

  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/png')
  link.download = `moviepilot-wrapped-${currentRange.value}.png`
  link.click()
}

// 格式化总览卡片数值
function formatCardValue(card: WrappedMetricCard) {
  return formatMetricValue(card.metric as WrappedMetric, card.value)
}

// 格式化指标数值，图表坐标轴使用短格式
function formatMetricValue(metric: WrappedMetric, value?: number | null, compact = false) {
  if (value === null || value === undefined) return '-'
  if (metric === 'success_rate') return `${Number(value).toFixed(compact ? 0 : 1)}%`
  if (metric === 'storage_used') return compact ? compactNumber(value) : formatBytes(value)
  return compact ? compactNumber(value) : Number(value).toLocaleString()
}

// 格式化榜单数值
function formatRankingValue(value: number) {
  return Number(value).toLocaleString()
}

// 格式化紧凑数值，用于图表坐标轴
function compactNumber(value: number) {
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return `${Math.round(value)}`
}

// 转换历史口径为中文标签
function historyModeLabel(mode: string) {
  const map: Record<string, string> = {
    backfilled: '真实回填',
    snapshot: '日快照',
    projected: '当前投影',
    optional: '可选增强',
  }
  return map[mode] ?? mode
}

// 计算总览卡片变化率展示
function deltaLabel(card: WrappedMetricCard) {
  if (card.delta_ratio === null || card.delta_ratio === undefined) return '不可比较'
  const sign = card.delta_ratio >= 0 ? '+' : ''
  return `${sign}${(card.delta_ratio * 100).toFixed(1)}%`
}

watch([currentRange, currentMetric], () => {
  loadWrappedData()
})

onMounted(() => {
  loadWrappedData()
})
</script>

<template>
  <div class="wrapped-page">
    <div class="wrapped-toolbar">
      <div>
        <h1>MoviePilot Wrapped</h1>
        <p>运行历史、媒体库变化和当前库画像</p>
      </div>
      <div class="toolbar-actions">
        <VBtnToggle v-model="currentRange" mandatory divided color="primary">
          <VBtn v-for="item in rangeOptions" :key="item.value" :value="item.value" size="small">
            {{ item.title }}
          </VBtn>
        </VBtnToggle>
        <VBtn color="primary" variant="tonal" :loading="rebuilding" prepend-icon="mdi-refresh" @click="rebuildWrapped">
          重建
        </VBtn>
        <VBtn variant="tonal" prepend-icon="mdi-image-outline" @click="exportPoster">导出</VBtn>
      </div>
    </div>

    <VAlert
      v-if="rebuildStatus && rebuildStatus.status !== 'idle'"
      class="mb-4"
      :type="rebuildStatus.status === 'failed' ? 'error' : rebuildStatus.status === 'running' ? 'info' : 'success'"
      variant="tonal"
    >
      {{ rebuildStatus.message || 'Wrapped 构建状态' }}
      <VProgressLinear v-if="rebuildStatus.status === 'running'" class="mt-2" :model-value="rebuildStatus.progress" />
    </VAlert>

    <VAlert v-if="overview?.empty_reason" class="mb-4" type="info" variant="tonal">
      {{ overview.empty_reason }}
    </VAlert>

    <VRow>
      <VCol v-for="card in overview?.cards ?? []" :key="card.metric" cols="12" sm="6" lg="3">
        <VCard class="metric-card" :loading="loading">
          <VCardText>
            <div class="d-flex align-center justify-space-between mb-3">
              <span class="text-medium-emphasis">{{ card.title }}</span>
              <VChip size="x-small" variant="tonal">{{ historyModeLabel(card.meta.history_mode) }}</VChip>
            </div>
            <div class="metric-value">{{ formatCardValue(card) }}</div>
            <div class="text-caption text-medium-emphasis mt-2">
              {{ deltaLabel(card) }}
            </div>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>

    <VRow class="mt-2">
      <VCol cols="12" lg="8">
        <VCard>
          <VCardItem>
            <VCardTitle>趋势曲线</VCardTitle>
            <template #append>
              <VBtnToggle v-model="currentMetric" mandatory divided density="comfortable">
                <VBtn v-for="item in metricOptions" :key="item.value" :value="item.value" size="small" :icon="item.icon" />
              </VBtnToggle>
            </template>
          </VCardItem>
          <VCardText>
            <VApexChart type="line" height="340" :options="chartOptions" :series="chartSeries" />
            <VAlert v-if="seriesData?.metric_meta.data_quality_note" class="mt-4" variant="tonal" type="info">
              {{ seriesData.metric_meta.data_quality_note }}
            </VAlert>
          </VCardText>
        </VCard>
      </VCol>

      <VCol cols="12" lg="4">
        <VCard>
          <VCardItem>
            <VCardTitle>高光故事</VCardTitle>
          </VCardItem>
          <VCardText>
            <VList v-if="visibleHighlights.length" lines="two">
              <VListItem v-for="item in visibleHighlights" :key="item.key">
                <template #prepend>
                  <VAvatar color="primary" variant="tonal">
                    <VIcon icon="mdi-star-four-points-outline" />
                  </VAvatar>
                </template>
                <VListItemTitle>{{ item.title }}</VListItemTitle>
                <VListItemSubtitle>
                  {{ item.date || '-' }} · {{ item.value?.toLocaleString() ?? '-' }} ·
                  {{ historyModeLabel(item.history_mode) }}
                </VListItemSubtitle>
              </VListItem>
            </VList>
            <VAlert v-else type="info" variant="tonal">{{ highlights?.empty_reason || '暂无高光' }}</VAlert>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>

    <VRow class="mt-2">
      <VCol v-for="group in rankings?.groups ?? []" :key="group.key" cols="12" md="6" xl="4">
        <VCard>
          <VCardItem>
            <VCardTitle>{{ group.title }}</VCardTitle>
            <template #append>
              <VChip size="x-small" variant="tonal">{{ historyModeLabel(group.history_mode) }}</VChip>
            </template>
          </VCardItem>
          <VCardText>
            <div v-if="group.items.length" class="ranking-list">
              <div v-for="item in group.items" :key="item.name" class="ranking-item">
                <div class="ranking-row">
                  <span>{{ item.name }}</span>
                  <strong>{{ formatRankingValue(item.value) }}</strong>
                </div>
                <VProgressLinear :model-value="(item.ratio ?? 0) * 100" height="6" rounded />
              </div>
            </div>
            <VAlert v-else type="info" variant="tonal">暂无数据</VAlert>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>

    <VAlert v-if="availability && !availability.watch_history_supported" class="mt-4" type="info" variant="tonal">
      观影模块当前未启用，报告不会展示占位数据。
    </VAlert>
  </div>
</template>

<style scoped lang="scss">
.wrapped-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wrapped-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;

  h1 {
    margin: 0;
    font-size: 2rem;
    line-height: 1.2;
  }

  p {
    margin: 6px 0 0;
    color: rgba(var(--v-theme-on-surface), 0.68);
  }
}

.toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.metric-card {
  min-height: 150px;
}

.metric-value {
  overflow-wrap: anywhere;
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.15;
}

.ranking-list {
  display: grid;
  gap: 14px;
}

.ranking-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-block-end: 6px;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@media (max-width: 960px) {
  .wrapped-toolbar {
    flex-direction: column;
  }

  .toolbar-actions {
    justify-content: flex-start;
  }
}
</style>
