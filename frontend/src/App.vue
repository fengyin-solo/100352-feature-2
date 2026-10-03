<template>
  <div class="app-shell">
    <aside class="app-side">
      <h1 class="app-title">水文监测站网管理系统</h1>
      <nav class="nav-list">
        <RouterLink v-for="item in navItems" :key="item.path" :to="item.path" class="nav-item">
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>
    <main class="app-main">
      <header class="app-head">
        <span class="head-desc">面向水文监测站点运行、水位流量雨量数据采集、遥测设备维护与数据整编发布的水文站网管理平台。</span>
        <span class="head-user">
          当前值班：{{ store.operator }} · {{ store.shiftLabel }} · 管理单位
          <select class="unit-select" :value="store.unit" @change="onUnitChange">
            <option v-for="unit in units" :key="unit" :value="unit">{{ unit }}</option>
          </select>
        </span>
      </header>
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { listRows } from '@/data/local-store'
import { useSessionStore } from '@/stores/session'

const store = useSessionStore()

// 可切换的管理单位取自站点数据里实际出现的单位，保证越权拦截有对照组。
const units = computed(() => {
  const set = new Set<string>([store.unit])
  for (const row of listRows('station')) {
    const unit = String(row['管理单位'] ?? '').trim()
    if (unit) {
      set.add(unit)
    }
  }
  return [...set]
})

function onUnitChange(event: Event) {
  store.setUnit((event.target as HTMLSelectElement).value)
}

const navItems = [{ label: "运营概览", path: "/" }, { label: "监测站点", path: "/station" }, { label: "水位监测", path: "/waterlevel" }, { label: "流量监测", path: "/discharge" }, { label: "雨量观测", path: "/rainfall" }, { label: "水质检测", path: "/waterquality" }, { label: "断面测量", path: "/crosssection" }, { label: "遥测设备", path: "/telemetry" }, { label: "数据整编", path: "/compilation" }, { label: "预警阈值", path: "/warning" }, { label: "地下水观测", path: "/groundwater" }, { label: "蒸发观测", path: "/evaporation" }, { label: "测流缆道", path: "/cableway" }, { label: "泥沙监测", path: "/sediment" }, { label: "通讯系统", path: "/communication" }, { label: "站房维护", path: "/stationhouse" }, { label: "仪器检定", path: "/calibration" }, { label: "巡检记录", path: "/inspection" }, { label: "测报方案", path: "/plan" }]
</script>
