# B6 API 接口文档

> **版本**：V1.0（对应 2026-05 交付版本）
> **基准代码**：`backend/src/routes/*.ts`
> **目标读者**：二次开发工程师 / 第三方系统对接方 / 测试团队

---

## 一、接口规范

### 1.1 协议与基础地址

| 环境 | Base URL |
|---|---|
| 开发 | `http://localhost:3001/api` |
| 生产 | `https://<甲方域名>/api`（Nginx 反向代理至 `127.0.0.1:3001`） |

- 协议：**HTTPS**（生产强制）
- 编码：**UTF-8**
- 时间格式：ISO 8601（`2026-05-14T10:30:00.000Z`）
- 金额：浮点数，保留两位小数；前端展示时千分位分隔

### 1.2 请求方式

| 方法 | 用途 |
|---|---|
| GET | 查询，参数走 query string |
| POST | 创建 / 触发动作，body 为 JSON |
| PUT | 全量更新 |
| PATCH | 部分更新（用户角色调整、订单进度等） |
| DELETE | 删除（多为软删） |

### 1.3 字符编码

- 请求头：`Content-Type: application/json; charset=utf-8`
- 文件上传：`multipart/form-data`
- 响应：`Content-Type: application/json; charset=utf-8`

---

## 二、认证方式

### 2.1 登录获取 Token

```http
POST /api/users/login
Content-Type: application/json

{
  "name": "张三",
  "password": "Aa123456"
}
```

**响应示例**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....",
  "user": {
    "id": 12,
    "name": "张三",
    "role": "sales",
    "subRole": null,
    "isAdmin": false,
    "tokenVersion": 3
  }
}
```

### 2.2 请求头规范

除 `/api/users/login`、`/api/users/register`、`/api/users/password-reset-requests` 之外的所有接口均需携带：

```http
Authorization: Bearer <token>
```

### 2.3 Token 失效与刷新

- **有效期**：24 小时
- **失效情况**：
  - 超过 24 小时自动失效
  - 用户被禁用 / 改密 / 角色变更 → `tokenVersion` 递增 → 旧 token 立即失效
- **刷新策略**：失效后客户端需重新登录（无 refresh token 设计，简单可靠）

---

## 三、通用响应格式

### 3.1 成功响应

```json
{
  "id": 123,
  "contractNo": "YMT-2026-0001",
  "...": "..."
}
```

> 多数接口直接返回业务对象；列表接口可能附带分页字段：`{ items, total, page, pageSize }`。

### 3.2 错误响应

```json
{
  "error": "客户不存在",
  "code": "NOT_FOUND"
}
```

- `error`：人类可读的错误信息（**中文**）
- `code`：可选错误码，便于客户端编程判断

---

## 四、错误码对照表

| HTTP Status | 含义 | 典型场景 |
|---|---|---|
| 200 | 成功 | 正常返回 |
| 201 | 创建成功 | POST 创建资源后 |
| 400 | 请求参数错误 | Zod 校验失败 / 业务规则不通过 |
| 401 | 未认证 | 缺少 token / token 失效 |
| 403 | 无权限 | 权限不足、角色不符 |
| 404 | 资源不存在 | id 不存在 |
| 409 | 冲突 | 合同编号冲突、用户名重复 |
| 413 | 文件过大 | 超过 10 MB |
| 500 | 服务端错误 | 未捕获异常（生产环境会脱敏） |

---

## 五、接口列表

> 说明：✅ = 需登录；🔐 = 需特定角色 / 权限；🌐 = 公开访问

### 5.1 用户认证 `/api/users`

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | `/register` | 🌐 | 自助注册（待审核） |
| POST | `/login` | 🌐 | 登录获取 token |
| POST | `/password-reset-requests` | 🌐 | 提交改密申请 |
| PATCH | `/me/password` | ✅ | 修改本人密码 |

**注册请求**

```json
{
  "name": "张三",
  "phone": "13800138000",
  "password": "Aa123456",
  "role": "sales"
}
```

**登录响应**：见 2.1

**改密请求**

```json
{
  "oldPassword": "old123",
  "newPassword": "new456"
}
```

---

### 5.2 用户管理 `/api/users`

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/` | 🔐 admin / 经理 / 业务员 / 内勤 | 全部用户列表（可筛选） |
| PATCH | `/:id/review` | 🔐 admin / system_admin | 通过 / 驳回注册 |
| POST | `/` | 🔐 admin | 管理员直接创建账号 |
| PATCH | `/:id/manage` | 🔐 admin / system_admin | 角色 / 子角色 / 启用 / 改密 |
| DELETE | `/:id` | 🔐 admin | 删除账号（软删） |

**列表筛选参数**

```
?role=sales        过滤角色
&subRole=clerk     过滤子角色
&status=active     启用 / 禁用 / 待审核
&keyword=张三      模糊匹配姓名/手机号
```

**角色管理请求**

```json
{
  "role": "manager",
  "subRole": "clerk",
  "isActive": true,
  "newPassword": "可选"
}
```

---

### 5.3 客户管理 `/api/customers`

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/` | 🔐 业务员 / 经理 / admin | 客户列表 |
| GET | `/recent` | 🔐 同上 | 最近客户（下拉用） |
| GET | `/search` | 🔐 同上 | 模糊搜索 |
| GET | `/:id` | 🔐 同上 | 客户详情（含订单 + 沟通记录） |
| POST | `/` | 🔐 业务员 / 经理 / admin | 新建客户 |
| PUT | `/:id` | 🔐 同上 | 修改客户 |
| DELETE | `/:id` | 🔐 同上 | 删除客户（软删） |
| POST | `/:id/logs` | 🔐 同上 | 新增沟通记录 |

**新建客户请求**

```json
{
  "name": "苏州振华机电",
  "contact": "李经理",
  "phone": "13900139000",
  "address": "江苏省苏州市工业园区...",
  "remark": "重点客户"
}
```

**沟通记录请求**

```json
{
  "method": "电话",
  "content": "确认下单意向，本周内出报价",
  "createdAt": "2026-05-14"
}
```

---

### 5.4 订单管理 `/api/orders`

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/` | 🔐 canViewOrders | 订单列表（业务员仅自己） |
| GET | `/:id` | 🔐 同上 | 订单详情（含明细、物料、审批日志） |
| POST | `/` | 🔐 canCreateOrderForSales | 新建订单 |
| PUT | `/:id` | 🔐 同上 | 修改订单 |
| DELETE | `/:id` | 🔐 同上 | 删除订单（仅 draft） |
| POST | `/:id/action` | 🔐 按动作不同 | **核心：状态机迁移** |
| PATCH | `/:id/progress` | 🔐 canHandleProduction | 生产进度更新 |
| POST | `/:id/parse-requirements` | 🔐 采购 / 生产 | 解析详细要求为物料候选 |

**列表筛选参数**

```
?status=pending_approval         订单状态（可逗号分隔多值）
&customerId=12                   客户
&keyword=YMT-2026                合同号关键字
&startDate=2026-01-01            交期范围
&endDate=2026-12-31
&page=1&pageSize=20              分页
```

**新建订单请求**

```json
{
  "customerId": 12,
  "contractRef": "PO-2026-08",
  "deliveryDate": "2026-06-30",
  "salespersonId": 5,
  "items": [
    {
      "productName": "ATC-100 减速器",
      "spec": "1:30",
      "unit": "台",
      "quantity": 50,
      "unitPrice": 320,
      "subtotal": 16000,
      "remark": "客户指定品牌"
    }
  ],
  "notes": "尽快交付"
}
```

**状态机动作（POST /:id/action）**

```json
{
  "action": "submit | approve | reject | reject_modify | finish_procurement | finish_production | ship | approve_ship | reject_ship",
  "reason": "可选，驳回 / 退回时必填"
}
```

完整状态机说明见 **B2 §7.1 订单状态机**。

---

### 5.5 产品管理 `/api/products`

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/` | 🔐 多角色可读 | 产品列表 |
| GET | `/:id` | 🔐 同上 | 产品详情（含 BOM） |
| POST | `/` | 🔐 canHandleProcurement | 新建产品 |

**新建产品请求**

```json
{
  "name": "ATC-100 减速器",
  "spec": "1:30",
  "unit": "台",
  "boms": [
    { "materialName": "齿轮", "qty": 4, "unit": "件" },
    { "materialName": "壳体", "qty": 1, "unit": "件" }
  ]
}
```

---

### 5.6 物料管理 `/api/materials`

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | `/` | ✅ | 为订单明细新建物料 |
| PUT | `/:id` | ✅ | 修改物料（名称 / 规格 / 单位 / 数量 / 状态 / 备齐日期） |
| DELETE | `/:id` | ✅ | 删除物料 |

**新建物料请求**

```json
{
  "orderItemId": 234,
  "name": "齿轮 M3",
  "spec": "Φ60",
  "unit": "件",
  "required": 200,
  "status": "in_progress"
}
```

**修改物料请求**（任意字段可选）

```json
{
  "status": "ready",
  "expectedDate": "2026-06-10",
  "urgency": "high",
  "notes": "已下单 ABC 供应商"
}
```

---

### 5.7 库存管理 `/api/inventory`

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/` | ✅ | 库存台账列表 |
| POST | `/` | ✅ | 新增库存条目 |
| PUT | `/:id` | ✅ | 修改库存（名称 / 规格 / 单位） |
| POST | `/:id/adjust` | ✅ | 调整库存数量（入库 / 出库） |
| DELETE | `/:id` | ✅ | 删除库存条目 |

**调整库存请求**

```json
{
  "delta": -10,           // 正数入库，负数出库
  "reason": "生产领料"
}
```

---

### 5.8 Excel 导入 `/api/excel`

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | `/preview` | 🔐 canCreateOrderForSales | 上传预览（不入库） |
| POST | `/import` | 🔐 同上 | 确认导入（创建订单） |

**预览请求**

```http
POST /api/excel/preview
Content-Type: multipart/form-data

file: <Excel 文件 .xlsx / .xls，≤ 10 MB>
```

**预览响应**

```json
{
  "contractInfo": {
    "contractTitle": "PROFORMA INVOICE",
    "contractRef": "PI-2026-08",
    "customerName": "Asaman Trading Co.",
    "supplierName": "Yameite Mechatronics",
    "orderDate": "2026-05-10",
    "deliveryDate": "2026-07-15"
  },
  "totalRows": 12,
  "rows": [/* 前 20 行 */],
  "items": [/* 解析后的产品明细 */],
  "sheetName": "Sheet1",
  "diagnostics": {
    "parser": "contract-table",
    "canImport": true,
    "missingRequiredFields": [],
    "warnings": []
  }
}
```

**导入请求**（确认预览后）

```http
POST /api/excel/import
Content-Type: multipart/form-data

file:           <Excel 文件>
customerId:     12
salespersonId:  5
contractRef:    PI-2026-08
deliveryDate:   2026-07-15
items:          <可选 JSON 字符串，前端编辑后的 items>
```

**导入响应**

```json
{
  "success": true,
  "imported": 1,
  "errors": [],
  "orders": [
    {
      "contractNo": "YMT-2026-0042",
      "itemCount": 12,
      "totalAmount": 156800,
      "totalQuantity": 320
    }
  ]
}
```

---

### 5.9 仪表盘 `/api/dashboard`

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/` | ✅ | 一次性返回看板全部数据 |

**响应字段**

```json
{
  "kpi": {
    "totalOrders": 234,
    "totalAmount": 5680000,
    "totalCustomers": 56,
    "pendingApproval": 8
  },
  "recentOrders": [/* 最新 10 单 */],
  "riskOrders": [/* 临近交期 / 已逾期 */],
  "monthlyStats": [/* 12 月销售趋势 */]
}
```

- 后端有内存缓存，命中时直接返回；订单创建 / 状态变更后自动清缓存

---

### 5.10 通知管理 `/api/notifications`

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/` | ✅ | 当前用户通知列表 |

**响应示例**

```json
{
  "items": [
    {
      "id": "ship_approval_42",
      "type": "ship_approval",
      "title": "待审批发货",
      "content": "订单 YMT-2026-0042 等待发货审批",
      "orderId": 42,
      "createdAt": "2026-05-14T09:30:00Z",
      "read": false
    }
  ],
  "unreadCount": 3
}
```

> 通知为**实时计算**（基于当前订单状态 + 用户角色），无独立通知表。

---

## 六、Webhook 与扩展接口

> V1.0 暂未提供 Webhook 能力。后续扩展点：
>
> - **发货完成 Webhook**：可在 `approve_ship` 后回调甲方 ERP
> - **审批通过 Webhook**：可联动财务系统
> - **库存预警 Webhook**：库存低于阈值时回调
>
> 扩展实现入口：`backend/src/routes/orders.ts` 的状态机迁移完成后。

---

## 七、接口变更日志

| 版本 | 日期 | 变更内容 |
|---|---|---|
| V1.0 | 2026-05 | 首次发布，含 9 个路由模块、80+ 个接口端点 |
| V1.0.1 | 2026-05 | 订单 `orderNo` 字段下线（合同编号统一用 `contractNo`） |
| V1.0.2 | 2026-05 | 发货流程调整：`finish_production → ready_ship → ship → pending_ship_approval → shipped`，发货审批权限收紧至 clerk + admin |

---

## 八、调用建议

1. **统一在前端封装 axios 实例**：自动注入 token、统一错误处理
2. **业务对接方建议采用 SDK 化封装**：基于本文档生成 TypeScript / Python SDK
3. **批量操作建议加并发限制**：单客户端建议 ≤ 10 并发，避免触发后端连接池上限
4. **大文件上传建议分片**：超过 5 MB 的 Excel 建议拆分为多个文件
5. **token 妥善保管**：客户端只存 localStorage，不要落文件 / 不要写日志

---

> **本文档自动随路由代码演进**。后续如新增接口，请同步更新本文件第五节。
