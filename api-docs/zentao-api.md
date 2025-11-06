我将为您抓取这些网址的内容，然后整理生成zentao-api.md文档。# 禅道 API 文档

> 本文档内容整理自禅道官方 API 手册，涵盖认证、产品、Bug 等核心接口。  
> 所有接口均以 `https://xxx.com/api.php/v1` 为前缀，**必须**通过 HTTPS 访问。  
> 更新时间：2025-11-05

---

## 1. 认证相关

### 1.1 获取访问令牌（Token）

| 项          | 值                                   |
|-------------|----------------------------------------|
| 方法        | POST                                   |
| 路径        | `/tokens`                              |
| 描述        | 使用账号密码换取后续接口所需的 Token     |

#### 请求体

| 字段名   | 类型   | 必填 | 说明     |
|----------|--------|------|----------|
| account  | string | 是   | 登录账号 |
| password | string | 是   | 登录密码 |

#### 请求示例

```json
{
  "account": "admin",
  "password": "123456"
}
```

#### 响应示例

```json
{
  "token": "cuejkiesahl9k1j8be5bv5lndo"
}
```

> 拿到 token 后，**所有后续接口**均需在请求头加入 `Token: <value>` 进行身份校验。

---

## 2. 产品相关

### 2.1 获取产品列表

| 项   | 值                    |
|------|-------------------------|
| 方法 | GET                     |
| 路径 | `/products`             |
| 头   | `Token: <token>`（可选） |

#### 查询参数（选填）

```
page=1&limit=20&program=6&status=normal
```

#### 200 响应字段说明

| 字段名        | 类型   | 说明                                             |
|---------------|--------|--------------------------------------------------|
| total         | int    | 总记录数                                         |
| products      | array  | 产品列表                                         |
| ∟ id          | int    | 产品 ID                                          |
| ∟ name        | string | 产品名称                                         |
| ∟ code        | string | 产品代号                                         |
| ∟ program     | int    | 所属项目集 ID                                    |
| ∟ type        | string | 产品类型：`normal`/`branch`/`platform`          |
| ∟ desc        | string | 产品描述                                         |
| ∟ acl         | string | 访问控制：`open`/`private`                       |
| ∟ whitelist   | array  | 白名单用户列表（acl=private 时可见）             |
| ∟ PO/QD/RD    | object | 产品/测试/发布负责人信息                         |
| ∟ createdBy   | object | 创建人信息                                       |
| ∟ createdDate | string | 创建时间（ISO8601）                              |

#### 响应示例

```json
{
  "total": 1,
  "products": [
    {
      "id": 6,
      "program": 6,
      "name": "测试",
      "code": "",
      "type": "normal",
      "desc": "",
      "acl": "private",
      "whitelist": [...],
      "PO": { "id": 2, "account": "productManager", "realname": "产品经理" },
      "createdBy": { "id": 1, "account": "admin", "realname": "管理员" },
      "createdDate": "2021-12-01T05:17:04Z"
    }
  ]
}
```

---

## 3. Bug 相关

### 3.1 获取产品下的 Bug 列表

| 项   | 值                           |
|------|--------------------------------|
| 方法 | GET                            |
| 路径 | `/products/{id}/bugs`          |
| 头   | `Token: <token>`（**必填**） |

#### 路径参数

| 参数 | 说明           |
|------|----------------|
| id   | 产品 ID（数字） |

#### 查询参数（选填）
##### 备注，不支持 status=assigntome 指派给我的BUG， openedbyme 我打开的BUG

```
page=1&limit=20&status=assigntome/openedbyme
```

#### 200 响应字段节选

| 字段名      | 类型   | 说明                                                                 |
|-------------|--------|----------------------------------------------------------------------|
| page        | int    | 当前页                                                               |
| total       | int    | 总条数                                                               |
| limit       | int    | 每页条数                                                             |
| bugs        | array  | Bug 列表                                                             |
| ∟ id        | int    | Bug ID                                                               |
| ∟ title     | string | Bug 标题                                                             |
| ∟ severity  | int    | 严重程度（1~4）                                                      |
| ∟ pri       | int    | 优先级（0~4）                                                        |
| ∟ type      | string | 类型：`codeerror`/`config`/`install`/`security`/`performance`/`others` |
| ∟ status    | object | 状态对象：`{code: "active", name: "激活"}`                           |
| ∟ openedBy  | object | 创建人信息                                                           |
| ∟ assignedTo| object | 被指派人信息                                                         |
| ∟ resolvedBy| object | 解决人信息                                                           |
| ∟ openedDate| string | 创建时间（ISO8601）                                                  |
| ∟ steps     | string | 重现步骤（HTML）                                                     |

#### 响应示例

```json
{
  "page": 1,
  "total": 1,
  "limit": 20,
  "bugs": [
    {
      "id": 9,
      "title": "Bug3",
      "severity": 3,
      "pri": 0,
      "type": "",
      "status": { "code": "active", "name": "激活" } | "active" | "resolved" | "closed",
      "openedBy": { "id": 1, "account": "admin", "realname": "管理员" },
      "openedDate": "2021-12-01T01:25:42Z",
      "steps": ""
    }
  ]
}
```

---

### 3.2 获取单个 Bug 详情

| 项   | 值                     |
|------|--------------------------|
| 方法 | GET                      |
| 路径 | `/bugs/{id}`             |
| 头   | `Token: <token>`（必填） |

#### 200 响应字段（节选）

| 字段名        | 类型   | 说明                                                                 |
|---------------|--------|----------------------------------------------------------------------|
| id            | int    | Bug ID                                                               |
| product       | int    | 所属产品 ID                                                          |
| execution     | int    | 所属执行 ID                                                          |
| title         | string | 标题                                                                 |
| steps         | string | 重现步骤（HTML）                                                     |
| status        | string | 状态：`active`/`resolved`/`closed`                                   |
| resolution    | string | 解决方案（状态为 resolved 时可见）                                   |
| resolvedBuild | string | 解决版本，`trunk` 或版本 ID                                          |
| duplicateBug  | int    | 重复 Bug ID（当 resolution=duplicate）                               |
| files         | array  | 附件列表                                                             |

#### 响应示例

```json
{
  "id": 1,
  "title": "aaa",
  "status": "active",
  "severity": 3,
  "pri": 1,
  "type": "codeerror",
  "steps": "<p>[步骤]进入首页</p><p>[结果]出现乱码</p><p>[期望]正常显示</p>",
  "openedBy": { "id": 7, "account": "tester1", "realname": "测试甲" },
  "assignedTo": { "id": 4, "account": "dev1", "realname": "开发甲" },
  "resolvedBy": null,
  "files": []
}
```

---

### 3.3 解决 Bug

| 项   | 值                           |
|------|--------------------------------|
| 方法 | POST                           |
| 路径 | `/bugs/{id}/resolve`           |
| 头   | `Token: <token>`（必填）       |

#### 请求体

| 字段名        | 类型   | 必填 | 说明                                                                                                                                |
|---------------|--------|------|-------------------------------------------------------------------------------------------------------------------------------------|
| resolution    | string | 是   | 解决方案：`bydesign`/`duplicate`/`external`/`fixed`/`notrepro`/`postponed`/`willnotfix`/`tostory` |
| duplicateBug  | int    | 否   | 重复 Bug ID（当 resolution=duplicate 时必填）                                                                                      |
| resolvedBuild | string | 否   | 解决版本，可填版本 ID 或 `trunk`                                                                                                   |
| resolvedDate  | string | 否   | 解决时间（格式：`2023-07-02 20:10:45`）                                                                                            |
| assignedTo    | string | 否   | 解决后指派给的用户账号                                                                                                              |
| comment       | string | 否   | 备注信息                                                                                                                            |

#### 请求示例

```json
{
  "resolution": "duplicate",
  "duplicateBug": 5,
  "resolvedBuild": "trunk",
  "resolvedDate": "2023-07-02 20:10:45",
  "assignedTo": "admin",
  "comment": "fix bug comment"
}
```

#### 200 响应示例（返回完整 Bug 实体）

```json
{
  "id": 1,
  "status": "resolved",
  "resolution": "duplicate",
  "resolvedBy": "admin",
  "resolvedDate": "2023-07-02 20:10:45",
  ...
}
```

---

## 4. 公共返回码

| HTTP 状态 | 含义说明               |
|-----------|------------------------|
| 200       | 请求成功               |
| 401       | Token 无效或已过期     |
| 403       | 无权限访问该资源       |
| 404       | 资源不存在             |
| 422       | 请求体字段校验失败     |
| 500       | 服务器内部错误         |

---

## 5. 快速开始（推荐流程）

1. 调用 `POST /tokens` 获取 `token`  
2. 在请求头加上 `Token: <token>`  
3. `GET /products` 查看可访问的产品  
4. `GET /products/{id}/bugs` 获取产品下的 Bug 列表  
5. `GET /bugs/{id}` 查看单个 Bug 详情  
6. `POST /bugs/{id}/resolve` 解决 Bug（按需传入对应字段）

---

## 6. 注意事项

1. 所有时间格式均为 **ISO8601** 或 **Y-m-d H:i:s**。
2. 接口返回的 HTML 字段（如 `steps`）已经过实体转义，可直接渲染。
3. 文件上传/下载、批量操作等高级功能请参考官方完整手册。
4. 禅道版本迭代频繁，字段可能新增或废弃，建议定期同步官方文档。

---

> 本文档仅提炼高频接口，更多能力（需求、任务、用例、测试单等）请查阅 [禅道官方 API 手册](https://www.zentao.net/book/api/)。