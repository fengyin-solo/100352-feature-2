import { defineStore } from 'pinia'

// 站点按管理单位做写权限隔离：只允许编辑本单位站点，跨单位动作由服务层拦截。
export const MANAGEMENT_UNITS = ['江汉水文测报中心', '鄂西水文测报中心']

export const useSessionStore = defineStore('session', {
  state: () => ({
    operator: '值班管理员',
    shiftLabel: '白班 08:00-20:00',
    scope: '水文监测站网管理系统',
    unit: MANAGEMENT_UNITS[0],
  }),
  getters: {
    canOperate: (state) => state.operator.length > 0,
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
    },
    setUnit(unit: string) {
      this.unit = unit
    },
  },
})
