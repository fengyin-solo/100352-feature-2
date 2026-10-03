import { defineStore } from 'pinia'

import { currentUser, saveCurrentUser } from '@/data/current-user'

export const useSessionStore = defineStore('session', {
  state: () => ({
    operator: currentUser().operator,
    unit: currentUser().unit,
    shiftLabel: '白班 08:00-20:00',
    scope: '水文监测站网管理系统',
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
      saveCurrentUser({ operator: this.operator, unit })
    },
  },
})
