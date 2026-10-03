import { listRows } from '@/data/local-store'
import { priorityRank, type StationView } from '@/data/station-views'
import type { EntryRow } from '@/data/types'

// 站点领域逻辑：顺着「页面 → local-service → local-store」既有取数链路加一层，
// 负责把巡检记录里的最近巡检时间装配到站点行，并处理组合定位与个人视图命中。

// 组合定位框同时检索这四个字段（任一包含关键字即命中）。
export const LOCATOR_FIELDS = ['站点编号', '站点名称', '所在河流', '运行状态'] as const

// 派生列：由巡检记录按站点编号取最大巡检日期得到。
export const LATEST_INSPECTION_FIELD = '最近巡检时间'
export const MATCHED_VIEW_FIELD = '命中视图'

export type StationQuery = {
  // 组合定位关键字（编号/名称/河流/运行状态，OR 匹配）
  keyword?: string
  // 最近巡检时间区间，按 yyyy-MM-dd 字符串比较
  inspectionFrom?: string
  inspectionTo?: string
}

export type StationListResult = {
  items: EntryRow[]
  matched: EntryRow[]
  total: number
  page: number
  size: number
}

function latestInspectionMap(): Map<string, string> {
  const map = new Map<string, string>()
  for (const record of listRows('inspection')) {
    const code = String(record['站点编号'] ?? '').trim()
    const date = String(record['巡检日期'] ?? '').trim()
    if (!code || !date) {
      continue
    }
    const current = map.get(code)
    if (!current || date > current) {
      map.set(code, date)
    }
  }
  return map
}

// 站点行加上派生列；不写回存储，派生数据每次查询时现算，巡检页改动后天然同步。
export function decorateStations(views: StationView[] = []): EntryRow[] {
  const latestMap = latestInspectionMap()
  const sortedViews = [...views].sort(priorityRank)
  return listRows('station').map((row) => {
    const code = String(row['站点编号'] ?? '').trim()
    const latest = latestMap.get(code) ?? ''
    const decorated: EntryRow = { ...row, [LATEST_INSPECTION_FIELD]: latest }
    const hit = sortedViews.find((view) => stationMatchesQuery(decorated, view))
    decorated[MATCHED_VIEW_FIELD] = hit ? hit.name : ''
    return decorated
  })
}

export function stationMatchesQuery(row: EntryRow, query: StationQuery): boolean {
  const keyword = query.keyword?.trim()
  if (keyword) {
    const hit = LOCATOR_FIELDS.some((field) => String(row[field] ?? '').includes(keyword))
    if (!hit) {
      return false
    }
  }
  const latest = String(row[LATEST_INSPECTION_FIELD] ?? '')
  const from = query.inspectionFrom?.trim()
  const to = query.inspectionTo?.trim()
  // 从未巡检的站点（空日期）不命中任何有时间边界的筛选，避免区间筛选时被误放出来。
  if (from && (!latest || latest < from)) {
    return false
  }
  if (to && (!latest || latest > to)) {
    return false
  }
  return true
}

function matchLegacy(row: EntryRow, filters: Record<string, string>): boolean {
  return Object.entries(filters)
    .filter(([, value]) => value.trim() !== '')
    .every(([field, value]) => String(row[field] ?? '').includes(value.trim()))
}

// 条件叠加顺序：旧筛选条件（AND）与组合定位（AND）先收敛；多个个人视图之间取并集，
// 视图集合与上面的条件之间仍为 AND。views 已按命中优先级排好序时直接使用。
export function queryStations(
  query: StationQuery,
  legacyFilters: Record<string, string>,
  views: StationView[],
  page: number,
  size: number,
): StationListResult {
  const sortedViews = [...views].sort(priorityRank)
  const decorated = decorateStations(sortedViews)
  const matched = decorated.filter(
    (row) =>
      matchLegacy(row, legacyFilters) &&
      stationMatchesQuery(row, query) &&
      (sortedViews.length === 0 || sortedViews.some((view) => stationMatchesQuery(row, view))),
  )

  const total = matched.length
  const safePage = clampPage(page, size, total)
  const start = (safePage - 1) * size
  return {
    items: size > 0 ? matched.slice(start, start + size) : matched,
    matched,
    total,
    page: safePage,
    size,
  }
}

// 翻页越界回收：page 小于 1 回到第 1 页；超出末页回到最后一个有效页；无数据回到第 1 页。
export function clampPage(page: number, size: number, total: number): number {
  if (!Number.isFinite(page) || page < 1) {
    return 1
  }
  if (size <= 0) {
    return 1
  }
  const lastPage = Math.max(1, Math.ceil(total / size))
  return Math.min(Math.floor(page), lastPage)
}
