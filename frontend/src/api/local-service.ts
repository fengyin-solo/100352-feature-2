import { currentUser } from '@/data/current-user'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import { MODULE_BY_KEY } from '@/data/modules'
import { findViews, listViews, removeView, saveView } from '@/data/views'
import type {
  ActionResult,
  EntryRow,
  ModuleMeta,
  OverviewResult,
  PageResult,
  SavedView,
  StationListOptions,
} from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

// 站点进入这些状态就算「停用」，要同步在仪器检定里补一条待办。
const STATION_DISABLED_STATUSES = ['暂停运行', '已撤销']
// 仪器检定里还在推进中的待办状态：同站点已存在就不重复补。
const CALIBRATION_OPEN_STATUSES = ['待送检', '送检中']

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

// 统一分页：页码越界时收回到有效页，调用方拿到的永远是能渲染的页。
function paginate(rows: EntryRow[], page: number, size: number): PageResult {
  const safeSize = Number.isFinite(size) && size > 0 ? Math.floor(size) : Math.max(rows.length, 1)
  const pageCount = Math.max(1, Math.ceil(rows.length / safeSize))
  const requested = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
  const safePage = Math.min(requested, pageCount)
  const start = (safePage - 1) * safeSize
  return { items: rows.slice(start, start + safeSize), total: rows.length, page: safePage, size: safeSize }
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

// 站点列表的取数链路：站点行先联查巡检记录补上最近巡检时间，再走组合定位 / 个人视图 / 分页。
export function listStationEntries(
  filters: Record<string, string> = {},
  options: StationListOptions = {},
): PageResult {
  const rows = withLastInspection(listRows('station'))
  const viewNames = options.views ?? []
  let matched: EntryRow[]
  if (viewNames.length > 0) {
    // 多个视图取并集；同一站点命中多个视图时只保留第一次出现的那一份。
    const seen = new Set<number>()
    matched = []
    for (const view of findViews('station', viewNames)) {
      for (const row of filterStationRows(rows, view.filters)) {
        if (!seen.has(Number(row.id))) {
          seen.add(Number(row.id))
          matched.push(row)
        }
      }
    }
  } else {
    matched = filterStationRows(rows, filters)
  }
  return paginate(matched, options.page ?? 1, options.size ?? 10)
}

function withLastInspection(rows: EntryRow[]): EntryRow[] {
  const lastByStation = lastInspectionByStation()
  return rows.map((row) => ({
    ...row,
    最近巡检时间: lastByStation.get(String(row['站点编号'] ?? '')) ?? '',
  }))
}

function lastInspectionByStation(): Map<string, string> {
  const last = new Map<string, string>()
  for (const record of listRows('inspection')) {
    const stationCode = String(record['站点编号'] ?? '').trim()
    const date = String(record['巡检日期'] ?? '').trim()
    if (!stationCode || !/^\d{4}-\d{2}-\d{2}/.test(date)) {
      continue
    }
    const prev = last.get(stationCode)
    if (!prev || date > prev) {
      last.set(stationCode, date)
    }
  }
  return last
}

// 组合定位：站点编号 / 站点名称 / 所在河流 / 运行状态 + 最近巡检时间全部按「且」组合；
// 其余字段沿用旧的包含匹配，旧筛选条件（如站点类型）照样生效。
function filterStationRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => String(value).trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => {
      const keyword = String(value).trim()
      if (field === '运行状态') {
        return String(row.status).includes(keyword)
      }
      if (field === '最近巡检时间') {
        const last = String(row['最近巡检时间'] ?? '')
        return last !== '' && last >= keyword
      }
      return String(row[field] ?? '').includes(keyword)
    }),
  )
}

export function listStationViews(): SavedView[] {
  return listViews('station')
}

export function saveStationView(name: string, filters: Record<string, string>): ActionResult {
  const trimmed = name.trim()
  if (!trimmed) {
    return { ok: false, message: '视图名称不能为空' }
  }
  saveView('station', trimmed, filters)
  return { ok: true, message: `已保存个人视图「${trimmed}」` }
}

export function removeStationView(name: string): ActionResult {
  if (!removeView('station', name)) {
    return { ok: false, message: `没有找到个人视图「${name}」` }
  }
  return { ok: true, message: `已删除个人视图「${name}」` }
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  // 越权拦截：记录归属其他管理单位时，当前值班人不能操作。
  const rowUnit = String(rows[index]['管理单位'] ?? '').trim()
  const userUnit = currentUser().unit.trim()
  if (rowUnit && userUnit && rowUnit !== userUnit) {
    return {
      ok: false,
      message: `${meta.entity}归属「${rowUnit}」，当前账号（${userUnit}）无权操作其他管理单位的站点`,
    }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  // 末尾的「XX状态」字段和当前状态保持同步，列表里不会出现两个口径。
  const statusField = meta.fields[meta.fields.length - 1]
  if (statusField.endsWith('状态') && statusField in updated) {
    updated[statusField] = target
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  let message = `${meta.entity}已${action}，当前状态「${target}」`
  if (key === 'station' && STATION_DISABLED_STATUSES.includes(target)) {
    // 站点停用后名下仪器要重新检定：在仪器检定里同步补一条待办，
    // 逻辑挂在服务层，任何入口停用站点都会触发，不只站点列表页。
    message += createCalibrationTodo(updated)
      ? '，已同步新增仪器检定待办'
      : '，仪器检定待办已存在，无需重复新增'
  }
  return { ok: true, message }
}

function createCalibrationTodo(station: EntryRow): boolean {
  const instrumentCode = String(station['站点编号'] ?? '').trim()
  if (!instrumentCode) {
    return false
  }
  const rows = listRows('calibration')
  const exists = rows.some(
    (row) =>
      String(row['仪器编号'] ?? '') === instrumentCode &&
      CALIBRATION_OPEN_STATUSES.includes(String(row.status)),
  )
  if (exists) {
    return false
  }
  const nextId = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const todo: EntryRow = {
    id: nextId,
    status: '待送检',
    pending: true,
    abnormal: false,
    记录编号: `CALI-${String(nextId).padStart(4, '0')}`,
    仪器编号: instrumentCode,
    仪器名称: `${String(station['站点名称'] ?? instrumentCode)}配套仪器`,
    检定单位: String(station['管理单位'] ?? ''),
    检定日期: new Date().toISOString().slice(0, 10),
    有效期至: '',
    检定结论: '',
    检定状态: '待送检',
  }
  saveRows('calibration', [...rows, todo])
  return true
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}
