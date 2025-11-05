# ZenTao Bugs MCP Server

基于 FastMCP 的禅道 Bug 管理 MCP 服务器，提供产品搜索、Bug 查询和解决功能。

## 功能特性

- 🔐 **自动登录** - 启动时自动登录禅道并持有 Token
- 🔍 **产品搜索** - 模糊搜索禅道产品
- 🐛 **Bug 管理** - 查询产品下的 Bug、获取详情、标记解决
- 📡 **SSE 流式传输** - 通过 Server-Sent Events 实时推送日志和结果
- 🔄 **串行处理** - 单进程队列处理，确保工具调用有序执行
- 🚀 **FastMCP 标准** - 兼容 MCP 协议，支持 HTTP Streaming 和 SSE

## 工具列表

| 工具名 | 参数 | 描述 |
|--------|------|------|
| `fuzzySearchProducts` | `keyword: string` | 模糊匹配产品名，返回 ≤10 条 |
| `fuzzySearchBugs` | `productId: number`, `keyword?: string`, `allStatuses?: boolean` | 返回产品下按标题模糊匹配的 Bug，≤10 条。**默认只返回状态为"激活"的BUG**，设置 `allStatuses=true` 可返回所有状态 |
| `getBugDetail` | `bugId: number` | 返回 Bug 全字段 + 原始 HTML 步骤 |
| `markBugResolved` | `bugId: number`, `comment?: string` | 把 Bug 置为已解决（resolution=fixed） |

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
# 生产模式
pnpm start

# 开发模式（文件变化自动重启）
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
│   └── server.mjs         # 原始 SSE 服务器（备用）
├── api-docs/              # API 文档
├── .env                   # 环境变量配置
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

## 许可证

ISC License