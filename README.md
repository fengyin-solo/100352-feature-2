# 水文监测站网管理系统

面向水文监测站点运行、水位流量雨量数据采集、遥测设备维护与数据整编发布的水文站网管理平台。

这是一个**纯前端**管理平台：Vue 3 + Vite + TypeScript，仓库里没有后端服务。业务数据由
`frontend/src/data/` 下的本地数据层提供：首次打开用示例数据播种，之后的登记、筛选与状态流转
结果都持久化在浏览器 `localStorage` 里，刷新或重开浏览器都还在。dev server 已关掉自动打开页面，
启动后按终端打印的地址手工打开。

## 目录结构

```text
.
├── frontend/                 Vue 3 + Vite + TypeScript 前端（唯一运行单元）
│   ├── src/views/            每个业务模块一个页面
│   ├── src/api/local-service.ts   本地数据服务：列表、筛选、动作流转、导出
│   ├── src/data/             模块元数据 / 示例数据 / localStorage 持久化
│   ├── src/stores/           会话与筛选状态
│   └── vite.config.ts        dev server 配置（open: false，无 /api 代理）
├── .gitignore
└── docker-compose.yml
```

## 启动

```bash
cd frontend
npm install
npm run dev
```

前端默认监听 `http://127.0.0.1:5173/`，dev server 不会自动打开浏览器，需要自己访问。

生产构建：

```bash
cd frontend
npm run build
```

## 业务模块

| 模块 | 目录 | 业务对象 | 主要字段 |
| --- | --- | --- | --- |
| 监测站点 | `station` | 水文监测站 | 站点编号、站点名称、站点类型 |
| 水位监测 | `waterlevel` | 水位记录 | 记录编号、站点编号、观测时间 |
| 流量监测 | `discharge` | 流量记录 | 记录编号、站点编号、测量方法 |
| 雨量观测 | `rainfall` | 雨量记录 | 记录编号、站点编号、观测时段 |
| 水质检测 | `waterquality` | 水质检测报告 | 报告编号、采样站点、采样时间 |
| 断面测量 | `crosssection` | 断面测量记录 | 记录编号、站点编号、断面名称 |
| 遥测设备 | `telemetry` | 遥测设备 | 设备编号、设备类型、所属站点 |
| 数据整编 | `compilation` | 整编成果 | 成果编号、整编年份、站点编号 |
| 预警阈值 | `warning` | 预警阈值配置 | 配置编号、站点编号、监测类型 |
| 地下水观测 | `groundwater` | 地下水观测记录 | 记录编号、井点编号、观测日期 |
| 蒸发观测 | `evaporation` | 蒸发观测记录 | 记录编号、站点编号、观测日期 |
| 测流缆道 | `cableway` | 测流缆道 | 缆道编号、所属站点、跨度米数 |
| 泥沙监测 | `sediment` | 泥沙监测记录 | 记录编号、站点编号、采样时间 |
| 通讯系统 | `communication` | 通讯设备 | 设备编号、设备类型、所属站点 |
| 站房维护 | `stationhouse` | 站房维护记录 | 记录编号、站点编号、维护类型 |
| 仪器检定 | `calibration` | 仪器检定记录 | 记录编号、仪器编号、仪器名称 |
| 巡检记录 | `inspection` | 巡检记录 | 记录编号、站点编号、巡检日期 |
| 测报方案 | `plan` | 测报方案 | 方案编号、方案名称、适用范围 |

## 约定

- 每个模块的页面在 `frontend/src/views/<模块>/index.vue`，页面只负责渲染，读写统一走
  `frontend/src/api/local-service.ts`。
- 字段、状态、动作与流转目标集中在 `frontend/src/data/modules.ts`；示例数据在
  `frontend/src/data/seed.ts`。
- 状态流转只允许在 `local-service.ts` 里改，页面组件不做业务判断；站点专属的组合定位、
  最近巡检时间装配与个人视图命中在 `frontend/src/api/station-service.ts`。
- 想回到初始数据：清掉浏览器里 `hydrology-monitor-station:entries:v2` 这一项，或调用 `resetModule(模块)`。
  旧版 `…:entries`（v1）数据会在首次访问时自动迁移，占位管理单位归一到「江汉水文测报中心」。

### 监测站点页

- **组合定位**：一个输入框同时检索站点编号、站点名称、所在河流、运行状态（任一命中）；
  另支持按「最近巡检时间」起止区间筛选（最近巡检时间由巡检记录按站点编号取最大日期派生）。
- **个人视图**：常用条件可按当前值班人保存为视图（localStorage 键
  `hydrology-monitor-station:station-views:v1`），可多选取并集；站点同时命中多个视图时，
  标签展示**最近更新**的视图（更新时间并列时取先保存的），删除按钮在视图胶囊右侧的 ×。
- **越权拦截**：站点写操作（升级/故障/停用/撤销）只允许本管理单位发起，跨单位在服务层拦截；
  页面右上角可切换当前管理单位用于演示。
- **停用联动**：新增「停用站点」动作（→暂停运行），会在仪器检定中幂等补一条「待送检」待办
  （按来源站点编号去重，同一站点已有待送检/送检中记录则不重复新增）；任何入口走
  `runAction` 都会触发，不限于站点列表。
- **翻页**：站点与仪器检定列表每页 5 条；页码越界（如筛选/动作后结果变少）自动回收到有效页。
- 旧的逐字段筛选条保留在页面下方，与新条件按 AND 叠加；`listEntries` 的旧调用签名保持兼容。
