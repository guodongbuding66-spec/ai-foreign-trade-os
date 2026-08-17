# AI外贸全能工作台 V1.0 产品需求文档 — 部署基线摘要

> 说明：本文件是本次 Cloudflare Pages 可部署基线使用的仓库内摘要，不替代用户提供的完整 3583 行原始 PRD。后续开发与验收仍以原始《AI外贸全能工作台 V1.0 产品需求文档》为最高基线。

**产品代号：Foreign Trade AI / AI Foreign Trade OS**  
**文档版本：V1.0**  
**文档日期：2026-08-17**  
**产品形态：Web SaaS / 企业私有部署兼容**

## 产品定义

系统不是外贸工具导航站，而是贯穿外贸业务全生命周期的智能操作系统：

**市场研究 → 客户发现 → 企业调查 → 联系人挖掘 → 联系方式验证 → AI客户分析 → AI开发 → CRM跟进 → 报价 → 产品/包装 → 自动装柜 → 订单 → 单证 → 合规 → 物流 → 回款 → 复购 → 数据分析**

核心原则：**一次录入、一份主数据、全流程复用。**

核心实体统一为 Company、Contact、Product、SKU、Opportunity、Quote、Order、Shipment；任何模块不得私自复制核心实体。

## P0 范围

### Foundation
- Login
- Tenant
- Users
- RBAC
- Database
- Audit
- Global Search
- Settings

### Product
- Product
- SKU
- Packaging
- **1套N箱**

### CRM
- Company
- Contact
- Opportunity
- Pipeline
- Activity
- Task

### Lead
- Company Search
- Contact Search
- Email Finder
- Email Verify
- Google Places

### AI
- AI Orchestrator
- Company Research
- Lead Agent
- Outreach Agent
- Structured Outputs
- Agent Run Logs

### Commercial
- Cost Calculator
- Quotes

### Container
- Automatic Loading
- Mixed Loading
- 3D
- Orthographic
- Manual Adjustment
- Export

### Documents
- PI
- CI
- PL

## 自动装柜关键要求

采用 Constraint-aware 3D Bin Packing，并考虑几何不重叠、不越界、门尺寸、重量、可旋转方向、禁止翻转、堆叠、承重、同套箱优先级、产品分组、卸货顺序、重心分布和人工锁定位置。

视图必须包括 Perspective、Top、Front、Back、Left、Right、Orthographic 3D。

产品包装从第一天支持 **1套N箱**，不得限制为 1套1箱或 1套2箱。

核心测试包装：

```text
SKU A
128 × 54 × 13 CM
49 KG

SKU B
128 × 54 × 11 CM
```

并覆盖 1套1箱、1套2箱、1套3箱、1套4箱、1套5箱、N箱、Mixed SKU；必须满足无重叠、无越界、数量正确、CBM正确、重量正确、视图一致。

## AI / Provider 原则

- AI 负责理解、判断、总结、推荐、生成、编排工具。
- 数据库负责最终事实、状态、金额、权限、审计、历史。
- AI 不能凭记忆修改核心业务事实。
- Agent 每次执行必须保存输入、工具、步骤结果、花费、错误、最终结果和人工批准状态。
- 第三方 Provider 必须可替换。
- Secret 必须服务器端保存，不返回浏览器。
- 未接入真实 Provider 时不得以假按钮或假结果冒充完成。

## Definition of Done

一个功能只有同时满足以下条件才算完成：

- UI完成
- API完成
- DB完成
- 数据验证完成
- Loading完成
- Empty完成
- Error完成
- Permission完成
- Audit完成
- Mobile完成
- Automated Test完成
- Manual QA完成

仅有按钮或页面：**不算完成。**

## 当前部署基线定位

本次部署是可运行的开发基线，不宣称 V1.0 全部 Provider 与生产基础设施已完成。

已实际实现的开发能力包括：

- Dashboard 与统一导航壳
- Company 本地 CRUD / 搜索
- Product / SKU / Packaging 与 1套N箱
- Quote Calculator 与 Cost Snapshot
- Container Solver 与 Top / Front / Right 正交视图
- Automation 内置动作真实写入本地业务数据
- Cloudflare Pages Functions `/api/health` 与 `/api/runtime`
- D1 核心表迁移草案
- 装柜 smoke test

真实 OpenAI、Apollo、Hunter、Google Places、WhatsApp、DeepL、DHL、FedEx、OFAC、Access2Markets 等 Provider，以及生产级 Auth / Tenant / RBAC / 服务端审计 / 数据库绑定，仍需按原始完整 PRD 后续开发。

## 最终判断标准

1. 不是工具导航，而是业务操作系统。
2. 所有核心数据统一。
3. 所有外部数据有来源。
4. AI必须能调用真实工具。
5. Agent全过程可查看。
6. 所有自动化必须真实执行。
7. 产品从第一天支持1套N箱。
8. CRM、报价、订单、装柜和单证互通。
9. 第三方Provider必须可替换。
10. 禁止出现“看起来有功能、实际上点了没反应”的假完成。
