#!/usr/bin/env node

import { FastMCP, UserError } from 'fastmcp';
import { z } from 'zod';
import { ZenTaoAPI } from './zentao-api.mjs';

// ---- Env & Config ----
const REQUIRED_ENVS = ['ZENTAO_BASE_URL', 'ZENTAO_ACCOUNT', 'ZENTAO_PASSWORD', 'PORT'];
for (const k of REQUIRED_ENVS) {
  if (!process.env[k] || String(process.env[k]).trim() === '') {
    console.error(`ENV ${k} is required`);
    process.exit(1);
  }
}

const BASE = process.env.ZENTAO_BASE_URL;
const ACCOUNT = process.env.ZENTAO_ACCOUNT;
const PASSWORD = process.env.ZENTAO_PASSWORD;
const PORT = Number(process.env.PORT || 3000);

// 创建 ZenTao API 实例
const zentaoAPI = new ZenTaoAPI(BASE, ACCOUNT, PASSWORD);

// ---- Single-flight queue (serialize tool calls) ----
/** @type {Array<() => Promise<void>>} */
const queue = [];
let busy = false;
function enqueue(task) { queue.push(task); drain(); }
async function drain() {
  if (busy) return;
  const next = queue.shift();
  if (!next) return;
  busy = true;
  try { await next(); } finally { busy = false; setImmediate(drain); }
}

// ---- Build FastMCP server ----
const server = new FastMCP({
  name: 'ZenTao Bugs MCP',
  version: '1.0.0',
  instructions: 'Tools to search ZenTao products/bugs and resolve bugs. Emits progress logs. All operations are serialized to ensure single-flight.',
  // Optional health endpoint customizations
  health: { enabled: true, path: '/health', message: 'ok', status: 200 },
  ping: { enabled: true, intervalMs: 15000 },
  roots: { enabled: false },
});

// Tools
server.addTool({
  name: 'searchProducts',
  description: '搜索产品列表。用于查看有哪些可用的产品，帮助选择精确的产品名称',
  parameters: z.object({ 
    keyword: z.string().optional().describe('产品名称关键词，不提供则返回所有产品'),
    limit: z.number().optional().default(20).describe('返回数量限制，默认20条')
  }),
  annotations: { title: 'Search Products', readOnlyHint: true, openWorldHint: true },
  execute: async (args, { log }) => {
    return await new Promise((resolve) => {
      enqueue(async () => {
        try {
          log.info('正在搜索产品...');
          
          const products = await zentaoAPI.searchProducts(args.keyword || '', args.limit);
          
          resolve({ 
            content: [{ 
              type: 'text', 
              text: JSON.stringify({ 
                products,
                count: products.length,
                keyword: args.keyword || '',
                message: `找到 ${products.length} 个产品${args.keyword ? `（关键词: ${args.keyword}）` : ''}`
              }) 
            }] 
          });
        } catch (err) {
          resolve({ 
            content: [{ 
              type: 'text', 
              text: JSON.stringify({ 
                error: err instanceof UserError ? err.message : String(err?.message || err) 
              }) 
            }] 
          });
        }
      });
    });
  },
});

server.addTool({
  name: 'getMyBug',
  description: '获取指定产品的一个BUG详情（指派给我的激活BUG）。这是最常用的工具，直接返回BUG的完整详情，而不是列表。使用产品名称而不是ID，更符合业务习惯',
  parameters: z.object({ 
    productName: z.string().describe('产品名称（必需）'),
    keyword: z.string().optional().describe('BUG标题关键词，用于快速定位特定类型的BUG')
  }),
  annotations: { title: 'Get My Bug', readOnlyHint: true, openWorldHint: true },
  execute: async (args, { log }) => {
    return await new Promise((resolve) => {
      enqueue(async () => {
        try {
          log.info(`正在获取产品 "${args.productName}" 的BUG详情...`);
          
          const result = await zentaoAPI.getBugByProductName(args.productName, {
            keyword: args.keyword
          });
          
          resolve({ 
            content: [{ 
              type: 'text', 
              text: JSON.stringify({ 
                bug: result.bug,
                product: result.product,
                message: `已获取产品 "${result.product.name}" 的BUG详情`
              }) 
            }] 
          });
        } catch (err) {
          resolve({ 
            content: [{ 
              type: 'text', 
              text: JSON.stringify({ 
                error: err instanceof UserError ? err.message : String(err?.message || err) 
              }) 
            }] 
          });
        }
      });
    });
  },
});

server.addTool({
  name: 'getMyBugs',
  description: '获取指派给我的BUG列表（默认只返回激活状态）。用于查看需要处理的BUG列表。必须指定产品ID以保持专注',
  parameters: z.object({ 
    productId: z.number().describe('指定产品ID（必需）'),
    keyword: z.string().optional().describe('BUG标题关键词搜索'),
    allStatuses: z.boolean().optional().default(false).describe('是否返回所有状态的BUG，默认false只返回激活状态'),
    limit: z.number().optional().default(10).describe('返回数量限制，默认10条')
  }),
  annotations: { title: 'Search Product Bugs', readOnlyHint: true, openWorldHint: true },
  execute: async (args, { log }) => {
    return await new Promise((resolve) => {
      enqueue(async () => {
        try {
          log.info('正在获取指派给我的BUG...');
          
          const bugs = await zentaoAPI.searchBugs(args.productId, {
            keyword: args.keyword,
            allStatuses: args.allStatuses,
            assignedToMe: true,
            limit: args.limit
          });
          
          resolve({ 
            content: [{ 
              type: 'text', 
              text: JSON.stringify({ 
                bugs,
                count: bugs.length,
                assignedToMe: true,
                activeOnly: !args.allStatuses
              }) 
            }] 
          });
        } catch (err) {
          resolve({ 
            content: [{ 
              type: 'text', 
              text: JSON.stringify({ 
                error: err instanceof UserError ? err.message : String(err?.message || err) 
              }) 
            }] 
          });
        }
      });
    });
  },
});

server.addTool({
  name: 'getBugDetail',
  description: '返回 Bug 全字段 + 原始 HTML 步骤',
  parameters: z.object({ bugId: z.number() }),
  annotations: { title: 'Get Bug Detail', readOnlyHint: true, openWorldHint: true },
  execute: async (args, { log }) => {
    return await new Promise((resolve) => {
      enqueue(async () => {
        try {
          if (!Number.isFinite(args.bugId)) throw new UserError('bugId 必须为数字');
          log.info('正在获取 Bug 详情...');
          
          const bug = await zentaoAPI.getBugDetail(args.bugId);
          resolve({ content: [{ type: 'text', text: JSON.stringify({ bug }) }] });
        } catch (err) {
          resolve({ 
            content: [{ 
              type: 'text', 
              text: JSON.stringify({ 
                error: err instanceof UserError ? err.message : String(err?.message || err) 
              }) 
            }] 
          });
        }
      });
    });
  },
});

server.addTool({
  name: 'markBugResolved',
  description: '把 Bug 置为已解决（resolution=fixed）',
  parameters: z.object({ bugId: z.number(), comment: z.string().optional() }),
  annotations: { title: 'Resolve Bug', readOnlyHint: false, idempotentHint: false, openWorldHint: true },
  execute: async (args, { log }) => {
    return await new Promise((resolve) => {
      enqueue(async () => {
        try {
          if (!Number.isFinite(args.bugId)) throw new UserError('bugId 必须为数字');
          log.info('正在将 Bug 置为已解决...');
          
          const result = await zentaoAPI.markBugResolved(args.bugId, args.comment);
          resolve({ content: [{ type: 'text', text: JSON.stringify({ bug: result }) }] });
        } catch (err) {
          resolve({ 
            content: [{ 
              type: 'text', 
              text: JSON.stringify({ 
                error: err instanceof UserError ? err.message : String(err?.message || err) 
              }) 
            }] 
          });
        }
      });
    });
  },
});

server.addTool({
  name: 'getNextBug',
  description: '获取下一个需要处理的BUG（指派给我的激活BUG）。使用 for yield 生成器模式，高效找到第一个匹配的BUG后立即返回。这是开始工作时最常用的工具。必须指定产品ID以保持专注',
  parameters: z.object({ 
    productId: z.number().describe('指定产品ID（必需）'),
    keyword: z.string().optional().describe('BUG标题关键词，用于快速定位特定类型的BUG')
  }),
  annotations: { title: 'Get Next Bug', readOnlyHint: true, openWorldHint: true },
  execute: async (args, { log }) => {
    return await new Promise((resolve) => {
      enqueue(async () => {
        try {
          log.info('正在获取下一个需要处理的BUG...');
          
          // 直接在指定产品中查找
          const bug = await zentaoAPI.searchFirstActiveBug(args.productId, {
            keyword: args.keyword,
            assignedToMe: true
          });
          
          if (bug) {
            resolve({ 
              content: [{ 
                type: 'text', 
                text: JSON.stringify({ bug }) 
              }] 
            });
          } else {
            resolve({ 
              content: [{ 
                type: 'text', 
                text: JSON.stringify({ 
                  message: '该产品中没有指派给你的激活BUG',
                  bug: null 
                }) 
              }] 
            });
          }
        } catch (err) {
          resolve({ 
            content: [{ 
              type: 'text', 
              text: JSON.stringify({ 
                error: err instanceof UserError ? err.message : String(err?.message || err) 
              }) 
            }] 
          });
        }
      });
    });
  },
});

server.addTool({
  name: 'getBugStats',
  description: '获取BUG统计信息：指派给我的BUG总数、激活状态数量等。用于了解工作量和进度。必须指定产品ID以保持专注',
  parameters: z.object({ 
    productId: z.number().describe('指定产品ID（必需）'),
    activeOnly: z.boolean().optional().default(true).describe('是否只统计激活状态BUG，默认true')
  }),
  annotations: { title: 'Get Bug Statistics', readOnlyHint: true, openWorldHint: true },
  execute: async (args, { log }) => {
    return await new Promise((resolve) => {
      enqueue(async () => {
        try {
          log.info('正在获取BUG统计信息...');
          
          const result = await zentaoAPI.searchBugsWithTotal(args.productId, {
            activeOnly: args.activeOnly,
            assignedToMe: true
          });
          
          resolve({ 
            content: [{ 
              type: 'text', 
              text: JSON.stringify({ 
                total: result.total,
                hasMore: result.hasMore,
                preview: result.bugs.slice(0, 5), // 只显示前5个作为预览
                assignedToMe: true,
                activeOnly: args.activeOnly,
                productId: args.productId
              }) 
            }] 
          });
        } catch (err) {
          resolve({ 
            content: [{ 
              type: 'text', 
              text: JSON.stringify({ 
                error: err instanceof UserError ? err.message : String(err?.message || err) 
              }) 
            }] 
          });
        }
      });
    });
  },
});

// ---- Bootstrap: login then start HTTP streaming (SSE included) ----
try {
  await zentaoAPI.login();
  console.log('Login success. Starting FastMCP httpStream...');
  await server.start({
    transportType: 'httpStream',
    httpStream: { port: PORT },
  });
  
  console.log(`\n🚀 ZenTao MCP Server started successfully!`);
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`🔗 MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`📡 SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`❤️  Health check: http://localhost:${PORT}/health`);
  
  console.log(`\n📋 MCP Client Configuration:`);
  console.log(JSON.stringify({
    mcpServers: {
      "zentao-server": {
        "url": `http://localhost:${PORT}/sse`
      }
    }
  }, null, 2));
  
  console.log(`\n📝 Environment Configuration Sample:`);
  console.log(`# 禅道配置`);
  console.log(`ZENTAO_BASE_URL=https://your-zentao.com`);
  console.log(`ZENTAO_ACCOUNT=your-username`);
  console.log(`ZENTAO_PASSWORD=your-password`);
  console.log(`\n# 服务器端口`);
  console.log(`PORT=3000`);
  
  console.log(`\n💡 Quick Start:`);
  console.log(`1. Copy the above env config to .env file`);
  console.log(`2. Update with your ZenTao credentials`);
  console.log(`3. Add the MCP config to your client (Trae/Claude Code)`);
  console.log(`4. Start using the ZenTao tools!`);
  
} catch (err) {
  console.error('Fatal: login failed:', err?.message || err);
  process.exit(1);
}
