<template>
  <section class="page" data-module="station">
    <header class="page-head">
      <div>
        <h2>监测站点管理</h2>
        <p class="page-desc">维护水文监测站，围绕站点编号、站点名称、所在河流、运行状态做组合定位，并可按最近巡检时间筛选；常用条件可存为个人视图。</p>
      </div>
      <div class="page-actions">
        <label class="unit-switch">
          当前管理单位
          <select :value="store.unit" @change="changeUnit(($event.target as HTMLSelectElement).value)">
            <option v-for="unit in units" :key="unit" :value="unit">{{ unit }}</option>
          </select>
        </label>
        <button class="btn primary" type="button" @click="openCreate">登记水文监测站</button>
        <button class="btn" type="button" @click="exportRows">导出监测站点清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar locator-bar" @submit.prevent="search">
      <label class="filter-item filter-wide">
        <span>组合定位（编号 / 名称 / 河流 / 运行状态）</span>
        <input v-model="keyword" placeholder="输入任一关键字定位站点" list="station-status-options" />
        <datalist id="station-status-options">
          <option v-for="status in statuses" :key="status" :value="status" />
        </datalist>
      </label>
      <label class="filter-item">
        <span>最近巡检时间起</span>
        <input v-model="inspectionFrom" type="date" />
      </label>
      <label class="filter-item">
        <span>最近巡检时间止</span>
        <input v-model="inspectionTo" type="date" />
      </label>
      <button class="btn primary" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetAll">重置条件</button>
    </form>

    <div class="view-bar">
      <span class="view-label">个人视图（{{ store.operator }}）：</span>
      <button
        v-for="view in views"
        :key="view.id"
        class="view-chip"
        :class="{ active: activeIds.includes(view.id) }"
        type="button"
        :title="viewSummary(view)"
        @click="toggleView(view.id)"
      >
        {{ view.name }}
        <span
          class="view-chip-del"
          role="button"
          tabindex="0"
          title="删除视图"
          @click.stop="removeView(view.id)"
          @keydown.enter.stop.prevent="removeView(view.id)"
        >×</span>
      </button>
      <span v-if="!views.length" class="view-empty">还没有保存的视图</span>
      <span class="view-save">
        <input v-model="viewName" class="view-name-input" placeholder="视图名称，如：长江正常站" />
        <button class="btn" type="button" @click="saveCurrentAsView">把当前条件存为个人视图</button>
      </span>
    </div>

    <!-- 旧版筛选条件保留：与组合定位、个人视图同时生效（AND），兼容老的使用习惯。 -->
    <form class="filter-bar legacy-bar" @submit.prevent="search">
      <label v-for="field in legacyFilterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">旧条件查询</button>
      <button class="btn ghost" type="button" @click="resetLegacyFilters">清空旧条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>最近巡检时间</th>
          <th>命中视图</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row['最近巡检时间'] || '从未巡检' }}</td>
          <td>
            <span v-if="row['命中视图']" class="legend-item">{{ row['命中视图'] }}</span>
            <span v-else>—</span>
          </td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 4" class="empty-state">没有符合条件的监测站点</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot station-foot">
      <span>共 {{ total }} 条监测站点记录</span>
      <Pager :page="page" :size="pageSize" :total="total" @update:page="goPage" />
      <span v-if="infoMessage" class="info-text">{{ infoMessage }}</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { downloadEntries } from '@/api/local-service'
import { queryStations, type StationQuery } from '@/api/station-service'
import Pager from '@/components/Pager.vue'
import { runAction as applyAction } from '@/api/local-service'
import {
  deleteView,
  listViews,
  saveView,
  type StationView,
} from '@/data/station-views'
import { MANAGEMENT_UNITS, useSessionStore } from '@/stores/session'
import type { EntryRow } from '@/data/types'

const store = useSessionStore()
const units = MANAGEMENT_UNITS

const columns = ["站点编号", "站点名称", "站点类型", "所在河流", "经纬度坐标", "建站年份", "管理单位", "运行状态"]
const legacyFilterFields = ["站点编号", "站点名称", "站点类型"]
const actions = ["升级为加强", "登记故障", "停用站点", "撤销站点"]
const statuses = ["正常运行", "设备故障", "汛期加强", "暂停运行", "已撤销"]
const pageSize = 5

const rows = ref<EntryRow[]>([])
const matchedRows = ref<EntryRow[]>([])
const total = ref(0)
const page = ref(1)
const errorMessage = ref('')
const infoMessage = ref('')

// 组合定位与最近巡检时间
const keyword = ref('')
const inspectionFrom = ref('')
const inspectionTo = ref('')
// 旧版逐字段筛选
const filters = ref<Record<string, string>>({})

// 个人视图
const views = ref<StationView[]>([])
const activeIds = ref<number[]>([])
const viewName = ref('')

const stats = computed(() => [
  { label: '站点总数', value: matchedRows.value.length },
  {
    label: '正常运行数',
    value: matchedRows.value.filter((row) => String(row.status) === '正常运行').length,
  },
  {
    label: '故障站点数',
    value: matchedRows.value.filter((row) => String(row.status) === '设备故障').length,
  },
])

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: matchedRows.value.filter((row) => String(row.status) === status).length,
  })),
)

const activeViews = computed(() =>
  activeIds.value
    .map((id) => views.value.find((view) => view.id === id))
    .filter((view): view is StationView => Boolean(view)),
)

function currentQuery(): StationQuery {
  return { keyword: keyword.value, inspectionFrom: inspectionFrom.value, inspectionTo: inspectionTo.value }
}

function viewSummary(view: StationView): string {
  const parts = [
    view.keyword ? `定位：${view.keyword}` : '',
    view.inspectionFrom || view.inspectionTo
      ? `巡检：${view.inspectionFrom || '…'} ~ ${view.inspectionTo || '…'}`
      : '',
  ].filter(Boolean)
  return parts.length ? parts.join('；') : '无条件（全部站点）'
}

function refreshViews() {
  views.value = listViews(store.operator)
}

function search() {
  page.value = 1
  reload()
}

function goPage(next: number) {
  page.value = next
  reload()
}

function resetLegacyFilters() {
  filters.value = {}
  search()
}

function resetAll() {
  keyword.value = ''
  inspectionFrom.value = ''
  inspectionTo.value = ''
  filters.value = {}
  activeIds.value = []
  viewName.value = ''
  errorMessage.value = ''
  search()
}

function toggleView(id: number) {
  activeIds.value = activeIds.value.includes(id)
    ? activeIds.value.filter((item) => item !== id)
    : [...activeIds.value, id]
  search()
}

function saveCurrentAsView() {
  errorMessage.value = ''
  const name = viewName.value.trim()
  if (!name) {
    errorMessage.value = '请先填写视图名称'
    return
  }
  const created = saveView(store.operator, {
    name,
    keyword: keyword.value.trim(),
    inspectionFrom: inspectionFrom.value,
    inspectionTo: inspectionTo.value,
  })
  viewName.value = ''
  refreshViews()
  if (!activeIds.value.includes(created.id)) {
    activeIds.value = [...activeIds.value, created.id]
  }
  search()
}

function removeView(id: number) {
  deleteView(store.operator, id)
  activeIds.value = activeIds.value.filter((item) => item !== id)
  refreshViews()
  reload()
}

function changeUnit(unit: string) {
  store.setUnit(unit)
}

function exportRows() {
  downloadEntries('station')
}

function openCreate() {
  errorMessage.value = '水文监测站登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  infoMessage.value = ''
  const result = applyAction('station', Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  infoMessage.value = result.message
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    // 页码越界（如停用后结果变少）由服务层回收到有效页，这里拿回回收后的页码。
    const payload = queryStations(
      currentQuery(),
      filters.value,
      activeViews.value,
      page.value,
      pageSize,
    )
    rows.value = payload.items
    matchedRows.value = payload.matched
    total.value = payload.total
    page.value = payload.page
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '监测站点列表读取失败'
  }
}

onMounted(() => {
  refreshViews()
  reload()
})
</script>
