import { clampPage } from '@/api/station-service'
import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import { useSessionStore } from '@/stores/session'
import type { ActionResult, EntryRow, ListQuery, ModuleMeta, OverviewResult, PageResult } from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

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

// 通用列表：兼容旧的 filters 直传，也支持 { filters, page, size }。
// 不传分页时一次性返回（旧页面行为不变）；传了分页则对越界页码做回收。
export function listEntries(key: string, query: Record<string, string> | ListQuery = {}): PageResult {
  const structured = 'page' in query || 'size' in query || 'filters' in query
  const filters = structured ? (query as ListQuery).filters ?? {} : (query as Record<string, string>)
  const paged = query as ListQuery
  const matched = filterRows(listRows(key), filters)
  if (paged.page === undefined) {
    return { items: matched, total: matched.length, page: 1, size: matched.length }
  }
  const size = paged.size && paged.size > 0 ? paged.size : matched.length || 1
  const page = clampPage(Number(paged.page), size, matched.length)
  const start = (page - 1) * size
  return { items: matched.slice(start, start + size), total: matched.length, page, size }
}

function currentUnit(): string {
  try {
    return useSessionStore().unit
  } catch {
    return ''
  }
}

// 越权拦截：站点写操作只允许本管理单位发起，别单位站点一律拦下，不写数据。
function assertStationWritable(meta: ModuleMeta, row: EntryRow): ActionResult | null {
  if (meta.key !== 'station') {
    return null
  }
  const ownerUnit = String(row['管理单位'] ?? '').trim()
  const unit = currentUnit()
  if (unit && ownerUnit && ownerUnit !== unit) {
    return {
      ok: false,
      message: `越权拦截：${row['站点编号'] ?? ''}（${row['站点名称'] ?? ''}）隶属${ownerUnit}，${unit}无权操作`,
    }
  }
  return null
}

// 停用站点联动：在仪器检定里补一条「待送检」待办。
// 同一来源站点已有待办/在检等未结记录时不重复新增，保证多次停用幂等。
function ensureCalibrationTodo(station: EntryRow): boolean {
  const sourceCode = String(station['站点编号'] ?? '').trim()
  const todos = listRows('calibration')
  const exists = todos.some((row) => {
    if (String(row['来源站点'] ?? '').trim() !== sourceCode) {
      return false
    }
    return ['待送检', '送检中'].includes(String(row.status))
  })
  if (exists) {
    return false
  }
  const nextId = todos.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const code = `CALI-${String(nextId).padStart(4, '0')}`
  const created: EntryRow = {
    id: nextId,
    status: '待送检',
    pending: true,
    abnormal: false,
    记录编号: code,
    仪器编号: code,
    仪器名称: `${String(station['站点名称'] ?? sourceCode)}在用监测仪器`,
    检定单位: '待定',
    检定日期: '',
    有效期至: '',
    检定结论: '',
    检定状态: '待送检',
    来源站点: sourceCode,
  }
  saveRows('calibration', [...todos, created])
  return true
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
  const denied = assertStationWritable(meta, rows[index])
  if (denied) {
    return denied
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
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)

  let message = `${meta.entity}已${action}，当前状态「${target}」`
  // 停用站点（暂停运行）必须同步给仪器检定新增待办，且任意入口进来都走这条链路。
  if (meta.key === 'station' && target === '暂停运行') {
    const created = ensureCalibrationTodo(updated)
    message += created
      ? '，已同步在「仪器检定」新增待送检待办'
      : '，仪器检定已有该站点的未结待办，未重复新增'
  }
  return { ok: true, message }
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
  return { filename: `${meta.name}-清单.csv`, content: `﻿${lines.join('\n')}` }
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
