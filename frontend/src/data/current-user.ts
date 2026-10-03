// 当前值班人档案：纯前端没有真实登录，用本地持久化的档案代替。
// 数据服务层（local-service）和会话 store 都从这里读，越权判断只有一处口径。
export type CurrentUser = {
  operator: string
  /** 管理单位：操作归属其他单位的站点时用它拦截。 */
  unit: string
}

const USER_STORAGE_KEY = 'hydrology-monitor-station:current-user'

export const DEFAULT_USER: CurrentUser = {
  operator: '值班管理员',
  unit: '城东水文中心',
}

function readUser(): CurrentUser {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_USER }
  }
  const raw = window.localStorage.getItem(USER_STORAGE_KEY)
  if (!raw) {
    return { ...DEFAULT_USER }
  }
  try {
    const parsed = JSON.parse(raw) as Partial<CurrentUser>
    return {
      operator:
        typeof parsed.operator === 'string' && parsed.operator ? parsed.operator : DEFAULT_USER.operator,
      unit: typeof parsed.unit === 'string' && parsed.unit ? parsed.unit : DEFAULT_USER.unit,
    }
  } catch {
    return { ...DEFAULT_USER }
  }
}

let cached: CurrentUser | null = null

export function currentUser(): CurrentUser {
  if (cached === null) {
    cached = readUser()
  }
  return cached
}

export function saveCurrentUser(user: CurrentUser): void {
  cached = { ...user }
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(cached))
  }
}
