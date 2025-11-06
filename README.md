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
| `searchProductBugs` | `keyword: string`, `bugKeyword?: string`, `productId?: number`, `allStatuses?: boolean` | **智能搜索**：如果搜索到1个产品，直接返回该产品的BUG列表；如果搜索到多个产品，返回产品列表供用户选择。**默认只返回状态为"激活"的BUG**，设置 `allStatuses=true` 可返回所有状态 |
| `getBugDetail` | `bugId: number` | 返回 Bug 全字段 + 原始 HTML 步骤 + 提取的图片URL列表 |
| `markBugResolved` | `bugId: number`, `comment?: string` | 把 Bug 置为已解决（resolution=fixed） |

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