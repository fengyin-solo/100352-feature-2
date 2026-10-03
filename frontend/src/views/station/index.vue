<template>
  <section class="page" data-module="station">
    <header class="page-head">
      <div>
        <h2>监测站点管理</h2>
        <p class="page-desc">维护水文监测站，围绕站点编号、站点名称、站点类型、所在河流做登记、筛选与状态流转。</p>
        <p class="page-desc">当前管理单位：{{ store.unit }}，仅可操作本单位站点。</p>
      </div>
      <div class="page-actions">
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

    <form class="filter-bar" @submit.prevent="applyFilters">
      <label class="filter-item">
        <span>站点编号</span>
        <input v-model="filters['站点编号']" placeholder="按站点编号检索" />
      </label>
      <label class="filter-item">
        <span>站点名称</span>
        <input v-model="filters['站点名称']" placeholder="按站点名称检索" />
      </label>
      <label class="filter-item">
        <span>所在河流</span>
        <input v-model="filters['所在河流']" placeholder="按所在河流检索" />
      </label>
      <label class="filter-item">
        <span>运行状态</span>
        <select v-model="filters['运行状态']">
          <option value="">全部状态</option>
          <option v-for="status in statuses" :key="status" :value="status">{{ status }}</option>
        </select>
      </label>
      <label class="filter-item">
        <span>最近巡检时间</span>
        <input v-model="filters['最近巡检时间']" type="date" title="只看不早于该日期巡检过的站点" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <div class="view-bar">
      <span class="view-label">个人视图</span>
      <button
        v-for="view in views"
        :key="view.name"
        class="view-chip"
        :class="{ active: activeViews.includes(view.name) }"
        type="button"
        @click="toggleView(view.name)"
      >
        {{ view.name }}
        <span class="chip-close" @click.stop="removeView(view.name)">×</span>
      </button>
      <input v-model="viewName" class="view-name" placeholder="视图名称" />
      <button class="btn ghost" type="button" @click="saveCurrentView">存为个人视图</button>
      <span v-if="activeViews.length" class="view-hint">
        已启用 {{ activeViews.length }} 个视图，结果为并集（命中多个视图的站点只保留一条），手工条件暂不生效
      </span>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in tableColumns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in tableColumns" :key="column">{{ row[column] || '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <template v-if="canOperateRow(row)">
              <button
                v-for="action in actions"
                :key="action"
                class="link"
                type="button"
                @click="runAction(action, row)"
              >
                {{ action }}
              </button>
            </template>
            <span v-else class="no-permission">无权操作</span>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="tableColumns.length + 2" class="empty-state">暂无监测站点数据，可先登记水文监测站</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条监测站点记录</span>
      <div class="pager">
        <button class="btn ghost" type="button" :disabled="page <= 1" @click="goPage(page - 1)">上一页</button>
        <span>第 {{ page }} / {{ pageCount }} 页</span>
        <button class="btn ghost" type="button" :disabled="page >= pageCount" @click="goPage(page + 1)">下一页</button>
        <select v-model.number="size" @change="applyFilters">
          <option v-for="option in sizeOptions" :key="option" :value="option">{{ option }} 条/页</option>
        </select>
      </div>
      <span v-if="noticeMessage" class="notice-text">{{ noticeMessage }}</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listStationEntries,
  listStationViews,
  moduleMeta,
  removeStationView,
  runAction as applyAction,
  saveStationView,
} from '@/api/local-service'
import { useSessionStore } from '@/stores/session'
import type { EntryRow, SavedView } from '@/data/types'

const meta = moduleMeta('station')
const columns = ["站点编号", "站点名称", "站点类型", "所在河流", "经纬度坐标", "建站年份", "管理单位", "运行状态"]
// 列表多带一列「最近巡检时间」：由巡检记录联查得出，不落在站点数据里。
const tableColumns = [...columns, "最近巡检时间"]
const actions = ["升级为加强", "登记故障", "撤销站点"]
const statuses = ["正常运行", "设备故障", "汛期加强", "暂停运行", "已撤销"]
const stats = [{"label": "站点总数", "value": 0}, {"label": "正常运行数", "value": 0}, {"label": "故障站点数", "value": 0}]
const sizeOptions = [5, 10, 20, 50]

const store = useSessionStore()

const rows = ref<EntryRow[]>([])
const total = ref(0)
const page = ref(1)
const pageCount = ref(1)
const size = ref(10)
const errorMessage = ref('')
const noticeMessage = ref('')
const filters = ref<Record<string, string>>({})
const views = ref<SavedView[]>([])
const activeViews = ref<string[]>([])
const viewName = ref('')

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function canOperateRow(row: EntryRow) {
  const unit = String(row['管理单位'] ?? '').trim()
  return !unit || unit === store.unit
}

function applyFilters() {
  // 手工查询优先：启用中的视图先退场，回到组合定位条件。
  activeViews.value = []
  noticeMessage.value = ''
  reload(1)
}

function resetFilters() {
  filters.value = {}
  activeViews.value = []
  noticeMessage.value = ''
  reload(1)
}

function toggleView(name: string) {
  const index = activeViews.value.indexOf(name)
  if (index >= 0) {
    activeViews.value.splice(index, 1)
  } else {
    activeViews.value.push(name)
  }
  noticeMessage.value = ''
  reload(1)
}

function refreshViews() {
  views.value = listStationViews()
  const known = new Set(views.value.map((view) => view.name))
  activeViews.value = activeViews.value.filter((name) => known.has(name))
}

function saveCurrentView() {
  errorMessage.value = ''
  const result = saveStationView(viewName.value, filters.value)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  noticeMessage.value = result.message
  viewName.value = ''
  refreshViews()
}

function removeView(name: string) {
  errorMessage.value = ''
  const result = removeStationView(name)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  noticeMessage.value = result.message
  refreshViews()
  reload(1)
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '水文监测站登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  noticeMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
  noticeMessage.value = result.message
}

function goPage(target: number) {
  reload(target)
}

function reload(targetPage?: number) {
  errorMessage.value = ''
  if (targetPage !== undefined) {
    page.value = targetPage
  }
  try {
    const payload = listStationEntries(filters.value, {
      views: activeViews.value,
      page: page.value,
      size: size.value,
    })
    rows.value = payload.items
    total.value = payload.total
    // 页码越界时服务层已收回到有效页，这里同步回组件。
    page.value = payload.page
    pageCount.value = Math.max(1, Math.ceil(payload.total / payload.size))
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '监测站点列表读取失败'
  }
}

onMounted(() => {
  refreshViews()
  reload()
})
</script>
