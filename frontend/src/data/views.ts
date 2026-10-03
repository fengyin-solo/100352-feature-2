import { currentUser } from './current-user'
import type { SavedView } from './types'

// 个人视图：把常用筛选条件按「模块 + 视图名」存到本地，归属当前值班人，互不可见。
const VIEWS_STORAGE_KEY = 'hydrology-monitor-station:views'

type ViewStore = Record<string, SavedView[]>

function readStore(): ViewStore {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {}
  }
  const raw = window.localStorage.getItem(VIEWS_STORAGE_KEY)
  if (!raw) {
    return {}
  }
  try {
    const parsed = JSON.parse(raw) as ViewStore
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStore(store: ViewStore): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(VIEWS_STORAGE_KEY, JSON.stringify(store))
  }
}

export function listViews(moduleKey: string, owner = currentUser().operator): SavedView[] {
  return (readStore()[moduleKey] ?? []).filter((view) => view.owner === owner)
}

/** 按名字取当前值班人的视图，不存在的名字直接跳过。 */
export function findViews(moduleKey: string, names: string[], owner = currentUser().operator): SavedView[] {
  const mine = listViews(moduleKey, owner)
  return names
    .map((name) => mine.find((view) => view.name === name))
    .filter((view): view is SavedView => Boolean(view))
}

/** 同名视图覆盖旧条件；空条件不入库。 */
export function saveView(
  moduleKey: string,
  name: string,
  filters: Record<string, string>,
  owner = currentUser().operator,
): SavedView {
  const store = readStore()
  const views = store[moduleKey] ?? []
  const cleaned: Record<string, string> = {}
  for (const [field, value] of Object.entries(filters)) {
    const keyword = String(value).trim()
    if (keyword !== '') {
      cleaned[field] = keyword
    }
  }
  const saved: SavedView = { name, owner, filters: cleaned, updatedAt: new Date().toISOString() }
  const index = views.findIndex((view) => view.owner === owner && view.name === name)
  if (index >= 0) {
    views[index] = saved
  } else {
    views.push(saved)
  }
  store[moduleKey] = views
  writeStore(store)
  return saved
}

export function removeView(moduleKey: string, name: string, owner = currentUser().operator): boolean {
  const store = readStore()
  const views = store[moduleKey] ?? []
  const next = views.filter((view) => !(view.owner === owner && view.name === name))
  if (next.length === views.length) {
    return false
  }
  store[moduleKey] = next
  writeStore(store)
  return true
}
