// 个人视图：常用筛选条件的保存，按当前值班人隔离，存在浏览器里。
// 一个站点可能同时命中多个视图，命中优先级由排序决定（最近更新优先）。

export type StationView = {
  id: number
  name: string
  owner: string
  keyword: string
  inspectionFrom: string
  inspectionTo: string
  updatedAt: number
}

const VIEW_KEY = 'hydrology-monitor-station:station-views:v1'

function readRaw(): StationView[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return []
  }  const raw = window.localStorage.getItem(VIEW_KEY)
  if (!raw) {
    return []
  }
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as StationView[]) : []
  } catch {
    return []
  }
}

function writeRaw(views: StationView[]): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(VIEW_KEY, JSON.stringify(views))
  }
}

// 更新时间取单调时钟：快速连续保存也不会出现同一毫秒并列，排序才稳定。
function nextStamp(views: StationView[]): number {
  const latest = views.reduce((max, view) => Math.max(max, view.updatedAt), 0)
  return Math.max(Date.now(), latest + 1)
}

// 命中优先级：最近更新的视图优先；更新时间相同时 id 小的优先（先保存的稳定排序）。
export function priorityRank(a: StationView, b: StationView): number {
  if (b.updatedAt !== a.updatedAt) {
    return b.updatedAt - a.updatedAt
  }
  return a.id - b.id
}

export function listViews(owner: string): StationView[] {
  return readRaw()
    .filter((view) => view.owner === owner)
    .sort(priorityRank)
}

export function saveView(owner: string, draft: Omit<StationView, 'id' | 'owner' | 'updatedAt'> & { id?: number }): StationView {
  const all = readRaw()
  const existing = draft.id ? all.find((view) => view.id === draft.id && view.owner === owner) : undefined
  if (existing) {
    Object.assign(existing, {
      name: draft.name,
      keyword: draft.keyword,
      inspectionFrom: draft.inspectionFrom,
      inspectionTo: draft.inspectionTo,
      updatedAt: nextStamp(all),
    })
    writeRaw(all)
    return existing
  }
  const nextId = all.reduce((max, view) => Math.max(max, view.id), 0) + 1
  const created: StationView = {
    id: nextId,
    name: draft.name,
    owner,
    keyword: draft.keyword,
    inspectionFrom: draft.inspectionFrom,
    inspectionTo: draft.inspectionTo,
    updatedAt: nextStamp(all),
  }
  writeRaw([...all, created])
  return created
}

export function deleteView(owner: string, id: number): void {
  writeRaw(readRaw().filter((view) => !(view.id === id && view.owner === owner)))
}
