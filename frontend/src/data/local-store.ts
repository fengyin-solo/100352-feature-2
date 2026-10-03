import { DEFAULT_USER } from './current-user'
import { SEED_ROWS } from './seed'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'hydrology-monitor-station:entries'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// 旧版示例数据里站点「管理单位」「运行状态」是占位文案、巡检记录的「站点编号」用的是
// 巡检模块自己的编号，直接留着会让越权拦截和最近巡检时间联查失效，这里做一次幂等迁移。
function migrateLegacyEntries(data: Record<string, EntryRow[]>): Record<string, EntryRow[]> {
  const stations = data.station
  if (Array.isArray(stations)) {
    const seedByCode = new Map(SEED_ROWS.station.map((row) => [String(row['站点编号']), row]))
    for (const row of stations) {
      const unit = row['管理单位']
      if (typeof unit === 'string' && /^监测站点样例\d+$/.test(unit)) {
        const seedRow = seedByCode.get(String(row['站点编号'] ?? ''))
        row['管理单位'] = String(seedRow?.['管理单位'] ?? DEFAULT_USER.unit)
      }
      const runStatus = row['运行状态']
      if (typeof runStatus === 'string' && /^监测站点样例\d+$/.test(runStatus)) {
        row['运行状态'] = String(row.status)
      }
    }
  }
  const inspections = data.inspection
  if (Array.isArray(inspections)) {
    for (const row of inspections) {
      const code = row['站点编号']
      if (typeof code === 'string' && /^INSP-\d{4}$/.test(code)) {
        row['站点编号'] = code.replace(/^INSP-/, 'STAT-')
      }
    }
  }
  return data
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    return migrateLegacyEntries({ ...fallback, ...parsed })
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}
