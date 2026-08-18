# AI Foreign Trade OS

**AI外贸全能工作台 V1.0 / Foreign Trade AI**

本仓库以用户提供的完整《AI外贸全能工作台 V1.0 产品需求文档》为开发与验收基线。`docs/AI外贸全能工作台 V1.0 产品需求文档.md` 保存本次可部署开发基线摘要；完整原始 PRD 仍作为后续开发的最高规范。

## 当前交付定位

这是 **M0/M1 可部署开发基线**，不是宣称全部第三方 Provider 已上线的最终生产版。

已实现并可实际操作：

- 响应式应用壳、菜单、全局搜索、Create 快捷入口
- Dashboard：从本地业务数据实时计算 KPI
- CRM Companies：新增 / 编辑 / 删除 / 搜索
- Product / SKU / Packaging：支持 **1套N箱** 动态包装结构
- Quote Calculator：成本、利润率、报价金额计算并保存版本基线
- Container Planner：基于包装实例的约束感知三维轴对齐贪心装载，输出 Top / Front / Right 正交视图、CBM/重量利用率、未装箱数量与 JSON
- Automation：本地规则可创建、启停和执行内置动作
- Pages Functions：`/api/health`、`/api/runtime`
- Cloudflare Pages SPA 路由与安全响应头
- D1 正式数据库基础 schema：Tenant / User / RBAC / Lead / CRM / Product / SKU / 1套N箱 / Quote / Load Plan / Automation / Document / Audit
- D1 只读健康检查：`/api/db/status`

尚未宣称完成：

- OpenAI / Apollo / Hunter / Google Places / WhatsApp / DeepL / DHL / FedEx 等真实 Provider
- 生产级登录 Session 与完整 RBAC enforcement
- 浏览器 localStorage 主数据切换到服务端 D1 CRUD
- 完整 3D WebGL 手工拖拽装柜器
- 正式 PDF/Excel 单证和装柜报告生成

这些能力在界面中会显示为“需要服务器 Provider / Binding”，不会伪装成已经完成。

## Cloudflare Pages

本项目仓库根目录就是静态站点目录，并包含 `functions/` Pages Functions：

- Framework preset: `None`
- Build command: `exit 0`
- Build output directory: `.`
- Root directory: 留空（使用仓库根目录）
- Production branch: `main`

Cloudflare Pages Functions 位于 `functions/`。

`_routes.json` 将 Functions invocation 限制在 `/api/*`，静态页面和资源不经过 Functions。

## Cloudflare D1

正式数据库建议命名：

`ai-foreign-trade-os-production`

Pages Functions 统一使用绑定名：

`DB`

部署步骤见：

`docs/D1_SETUP.md`

迁移顺序：

1. `migrations/0001_init.sql`
2. `migrations/0002_foundation.sql`

绑定并执行 schema 后，可通过以下只读接口验证：

- `/api/runtime`
- `/api/db/status`

在 Login / Session / Tenant isolation / RBAC / Audit enforcement 完成前，不开放匿名 D1 写入 API。

## Validation

```bash
npm run check
```

当前 smoke test 使用 PRD 指定包装：

- 128 × 54 × 13 cm / 49 kg
- 128 × 54 × 11 cm / 49 kg

20 套共 40 箱，预期 `40 placed / 0 unloaded`，并校验无越界与无重叠。

## 开发原则

遵守 PRD Definition of Done：只有 UI 不算完成；功能必须逐步补齐 API、DB、校验、Loading、Empty、Error、权限、审计、移动端与测试。
