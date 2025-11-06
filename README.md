# ZenTao Bugs MCP Server

基于 FastMCP 的禅道 Bug 管理 MCP 服务器，提供产品搜索、Bug 查询和解决功能。

## 功能特性

- 🔐 **自动登录** - 启动时自动登录禅道并持有 Token
- 🧠 **智能搜索** - 一步完成产品和BUG搜索：找到唯一产品时直接返回BUG列表，多个产品时提供选择
- 🐛 **Bug 管理** - 查询产品下的 Bug、获取详情、标记解决
- 🖼️ **图片提取** - 自动从BUG步骤中提取图片URL，便于查看截图
- 🎯 **精准搜索** - API层面过滤激活BUG，自动翻页确保获取足够的活跃BUG
- 📡 **SSE 流式传输** - 通过 Server-Sent Events 实时推送日志和结果
- 🔄 **串行处理** - 单进程队列处理，确保工具调用有序执行
- 🚀 **FastMCP 标准** - 兼容 MCP 协议，支持 HTTP Streaming 和 SSE
- 📉 **流量优化** - 智能合并搜索步骤，减少API调用和数据传输

## 工具列表

| 工具名 | 参数 | 描述 |
|--------|------|------|
| `searchProducts` | `keyword?: string`, `limit?: number` | **搜索产品**：查看有哪些可用的产品，帮助选择精确的产品名称。支持关键词搜索 |
| `getMyBug` | `productName: string`, `keyword?: string` | **获取我的BUG详情**：获取指定产品的一个BUG详情（指派给我的激活BUG）。**这是最常用的工具**，直接返回BUG的完整详情，而不是列表。**使用产品名称而不是ID，更符合业务习惯** |
| `getMyBugs` | `productId: number`, `keyword?: string`, `allStatuses?: boolean`, `limit?: number` | **获取我的BUG列表**：获取指派给我的BUG列表（**默认只返回激活状态**）。用于查看需要处理的BUG列表。**必须指定产品ID以保持专注** |
| `getNextBug` | `productId: number`, `keyword?: string` | **获取下一个BUG**：获取下一个需要处理的BUG（指派给我的激活BUG）。使用 **for yield 生成器模式**，高效找到第一个匹配的BUG后立即返回。**必须指定产品ID以保持专注** |
| `getBugStats` | `productId: number`, `activeOnly?: boolean` | **BUG统计**：获取指派给我的BUG统计信息（总数、激活数量等）。用于了解工作量和进度。**必须指定产品ID以保持专注** |
| `getBugDetail` | `bugId: number` | **BUG详情**：返回 Bug 全字段 + 原始 HTML 步骤 + 提取的图片URL列表 |
| `markBugResolved` | `bugId: number`, `comment?: string` | **标记已解决**：把 Bug 置为已解决（resolution=fixed） |

### 典型工作流程

#### 🔄 日常BUG处理流程

**步骤1：查看可用产品（可选）**
```json
{
  "keyword": "电商",
  "limit": 10
}
```
- 🔍 **产品发现**：查看有哪些可用的产品
- 📝 **精确命名**：获取准确的产品名称，避免模糊匹配

**步骤2：获取一个BUG的完整详情**
```json
{
  "productName": "电商平台",
  "keyword": "登录"
}
```
- 🎯 **精准定位**：通过产品名称自动找到指派给你的第一个激活BUG
- 📋 **完整详情**：直接返回BUG的完整信息，无需额外调用
- ⚡ **高效搜索**：使用产品名称，更符合业务习惯
- 🔍 **精确匹配**：如果找到多个产品会提示用户选择，确保准确性

**步骤3：标记为已解决**
```json
{
  "bugId": 123,
  "comment": "已修复登录页面显示问题"
}
```
- ✅ **快速解决**：一键标记BUG为已解决状态

**步骤4：继续下一个**
重复步骤2，处理下一个BUG...

#### 📊 其他工具使用场景

**查看BUG列表（批量操作时）**
```json
{
  "productId": 1,
  "limit": 20,
  "keyword": "界面"
}
```

**查看BUG统计**
```json
{
  "productId": 1,
  "activeOnly": true
}
```

#### 📊 工作量管理

**查看我的BUG统计**
```json
{
  "productId": 1,
  "activeOnly": true
}
```
- 📈 **工作量统计**：了解当前有多少激活BUG需要处理
- 📋 **优先级排序**：按严重程度自动排序

**查看我的BUG列表**
```json
{
  "productId": 1,
  "limit": 20,
  "keyword": "界面"
}
```
- 📝 **批量查看**：获取指派给你的BUG列表
- 🔍 **关键词搜索**：快速定位特定类型的BUG

#### 🎯 工具优势

- **🎯 默认指派给我**：所有工具默认只查询指派给你的BUG，减少干扰
- **⚡ 默认激活状态**：默认只显示激活状态的BUG，专注待处理任务
- **🏷️ 产品名称友好**：主要工具支持使用产品名称而不是ID，更符合业务习惯
- **📋 直接返回详情**：`getMyBug` 直接返回BUG的完整详情，减少调用步骤
- **🔍 精确匹配验证**：模糊搜索产品时，如果找到多个产品会提示用户选择，确保准确性
- **🔒 必须指定产品**：所有工具都要求指定产品，确保一段时间内专注一个产品
- **🔄 流程优化**：工具设计完全符合"获取→处理→解决→下一个"的工作流程
- **💰 流量节省**：使用生成器模式，找到即停止，避免不必要的数据传输
- **📊 智能统计**：提供准确的工作量统计，便于进度管理

### 图片提取功能

`getBugDetail` 工具现在支持自动从BUG步骤中提取图片：

```json
{
  "bug": {
    "id": 123,
    "title": "登录页面显示异常",
    "steps": "<p>步骤1：打开登录页面</p><p><img src=\"https://example.com/screenshot.png\" /></p>",
    "stepsImages": [
      "https://example.com/screenshot.png"
    ]
  }
}
```

**特性**：
- 🖼️ **自动识别** - 从HTML内容中提取所有`<img>`标签的`src`属性
- 🔗 **URL过滤** - 只返回HTTP/HTTPS开头的有效图片链接
- 📋 **独立存储** - 图片URL单独存储在`stepsImages`数组中，便于访问 |

## 快速开始

### 1. 环境配置

复制 `.env.example` 为 `.env` 并配置禅道信息：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 禅道配置
ZENTAO_BASE_URL=https://your-zentao.com/api.php/
ZENTAO_ACCOUNT=your-username
ZENTAO_PASSWORD=your-password

# 服务器端口
PORT=3000
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 启动服务器

```bash
# 方式1: 使用 npx (推荐)
npx mcp-zentao-bugs

# 方式2: 本地安装后运行
pnpm start

# 方式3: 开发模式（文件变化自动重启）
pnpm dev
```

服务器启动后会：
- 自动登录禅道获取 Token
- 在指定端口启动 HTTP Streaming 服务
- 提供 `/mcp`（HTTP Streaming）和 `/sse`（SSE）端点

### 4. 健康检查

```bash
curl http://localhost:3000/health
```

## MCP 客户端配置

### Trae / Claude Code 配置

在 Trae 或 Claude Code 的 MCP 配置中添加：

```json
{
  "mcpServers": {
    "zentao-server": {
      "url": "http://localhost:3000/sse"
    }
  }
}
```

### Claude Desktop 配置

在 Claude Desktop 的 MCP 配置文件中添加：

```json
{
  "mcpServers": {
    "zentao-server": {
      "command": "node",
      "args": ["src/mcp-server.mjs"],
      "env": {
        "ZENTAO_BASE_URL": "https://your-zentao.com/api.php/",
        "ZENTAO_ACCOUNT": "your-username",
        "ZENTAO_PASSWORD": "your-password",
        "PORT": "3000"
      }
    }
  }
}
```

## 开发

### 项目结构

```
├── src/
│   ├── mcp-server.mjs     # FastMCP 服务器主文件
│   ├── zentao-api.mjs     # 禅道 API 封装模块
│   └── server.mjs         # 原始 SSE 服务器（备用）
├── scripts/               # 发布和工具脚本
│   ├── publish.sh         # Linux/macOS 发布脚本
│   ├── publish.bat        # Windows 发布脚本
│   └── pre-publish.js     # 发布前检查脚本
├── api-docs/              # API 文档
├── .env                   # 环境变量配置
├── .env.example           # 环境变量模板
├── package.json
└── README.md
```

### 环境变量

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `ZENTAO_BASE_URL` | ✅ | 禅道 API 基础地址 |
| `ZENTAO_ACCOUNT` | ✅ | 禅道登录账号 |
| `ZENTAO_PASSWORD` | ✅ | 禅道登录密码 |
| `PORT` | ❌ | 服务器端口（默认：3000） |

### 脚本命令

```bash
# 安装依赖
pnpm install

# 启动服务器
pnpm start

# 开发模式（监听文件变化）
pnpm dev
```

## API 端点

- **HTTP Streaming**: `http://localhost:3000/mcp`
- **SSE**: `http://localhost:3000/sse`
- **健康检查**: `http://localhost:3000/health`

## 技术栈

- **FastMCP** - MCP 服务器框架
- **Node.js 20+** - 运行时环境
- **Zod** - 参数验证
- **dotenv** - 环境变量管理
- **模块化架构** - 禅道API独立封装，便于维护和测试

## 故障排除

### 登录失败

1. 检查 `.env` 文件中的禅道配置是否正确
2. 确认网络可以访问禅道服务器
3. 验证账号密码是否有权限访问 API

### 连接问题

1. 确认服务器已启动：`curl http://localhost:3000/health`
2. 检查防火墙设置，确保端口可访问
3. 查看服务器日志获取详细错误信息

### 工具调用失败

1. 检查禅道 Token 是否有效（Token 过期需要重启服务器）
2. 确认传入的参数格式正确
3. 查看服务器日志中的错误信息

### API 分页问题

**问题描述**：禅道API的分页机制存在特殊行为，当请求的页码超出最大页数时，API不会返回空数据，而是返回第一页的数据，但返回的页码字段与请求的页码不一致。

**解决方案**：
- **分页有效性检查**：通过比较 `data.page` 与请求的 `page` 参数来判断是否超出最大页数
- **智能分页**：逐页获取数据，当检测到页码不一致时停止分页
- **性能优化**：设置合理的最大页数限制（50页），防止无限循环
- **数据完整性**：确保在到达最后一页时正确处理所有数据

**实现细节**：
```javascript
// 检查分页是否有效：如果返回的页码与请求的页码不一致，说明已超出最大页数
if (data.page && data.page !== page) {
  break; // 已到达最后一页
}
```

## 发布到 npmjs

### 发布前准备

1. **注册 npm 账号**
   ```bash
   npm adduser
   # 或使用现有账号: npm login
   ```

2. **检查项目状态**
   ```bash
   # 运行发布前检查
   npm run pre-release
   
   # 或手动检查
   ./scripts/publish.sh patch --dry-run
   ```

### 发布流程

#### 方式1: 使用发布脚本 (推荐)

```bash
# 发布补丁版本
./scripts/publish.sh patch

# 发布次要版本
./scripts/publish.sh minor

# 发布主要版本
./scripts/publish.sh major
```

#### 方式2: 使用 npm 命令

```bash
# 发布补丁版本
npm run release:patch

# 发布次要版本
npm run release:minor

# 发布主要版本
npm run release:major
```

#### 方式3: 手动发布

```bash
# 1. 更新版本
npm version patch

# 2. 发布
npm publish

# 3. 推送标签
git push && git push --tags
```

### 发布脚本功能

- **自动检查**: 检查项目状态、依赖、文件完整性
- **版本管理**: 自动更新版本号并创建 git tag
- **安全发布**: 检查 npm 登录状态和包名可用性
- **跨平台支持**: 提供 bash 和 Windows batch 脚本

### 版本管理策略

- **patch**: 修复 bug，向后兼容 (1.0.0 → 1.0.1)
- **minor**: 新增功能，向后兼容 (1.0.0 → 1.1.0)
- **major**: 重大变更，可能不兼容 (1.0.0 → 2.0.0)

### 发布检查清单

- [ ] 测试通过 (`npm test`)
- [ ] README.md 更新完整
- [ ] 版本号已更新
- [ ] 所有更改已提交
- [ ] npm 账号已登录
- [ ] 包名可用性检查

## 许可证

ISC License