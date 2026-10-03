import { SEED_ROWS } from './seed'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
// v2：站点引入真实管理单位与组合定位；旧版 v1 数据会做一次迁移，不直接丢弃。
const STORAGE_KEY = 'hydrology-monitor-station:entries:v2'
const LEGACY_STORAGE_KEY = 'hydrology-monitor-station:entries'

// 旧播种数据里站点管理单位是“监测站点样例N”占位值，迁移时统一归到当前默认管理单位，
// 避免老数据被当成“外单位”而拦截正常操作。
export const DEFAULT_UNIT = '江汉水文测报中心'
const LEGACY_PLACEHOLDER = '监测站点样例'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function migrateLegacy(parsed: Record<string, EntryRow[]>): Record<string, EntryRow[]> {
  const stations = parsed.station
  if (!Array.isArray(stations)) {
    return parsed
  }
  const next = clone(parsed)
  next.station = stations.map((row) =>
    String(row['管理单位'] ?? '').startsWith(LEGACY_PLACEHOLDER)
      ? { ...row, 管理单位: DEFAULT_UNIT }
      : row,
  )
  return next
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw) {
    try {
      return { ...fallback, ...(JSON.parse(raw) as Record<string, EntryRow[]>) }
    } catch {
      // v2 数据损坏时落到下面的迁移/播种逻辑
    }
  }
  const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY)
  if (legacyRaw) {
    try {
      const migrated = migrateLegacy(JSON.parse(legacyRaw) as Record<string, EntryRow[]>)
      const merged = { ...fallback, ...migrated }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
      return merged
    } catch {
      // 旧数据也不可读时直接重新播种
    }
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
  return fallback
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
