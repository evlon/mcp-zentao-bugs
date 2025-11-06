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
  name: 'searchProductBugs',
  description: '智能搜索产品和BUG：如果搜索到1个产品，直接返回该产品的BUG列表；如果搜索到多个产品，返回产品列表供用户选择。默认只返回状态为"激活"的BUG，除非指定 allStatuses=true 才返回所有状态',
  parameters: z.object({ 
    keyword: z.string(),
    bugKeyword: z.string().optional(),
    productId: z.number().optional(),
    allStatuses: z.boolean().optional().default(false)
  }),
  annotations: { title: 'Search Product Bugs', readOnlyHint: true, openWorldHint: true },
  execute: async (args, { log, streamContent }) => {
    return await new Promise((resolve) => {
      enqueue(async () => {
        try {
          const kw = (args.keyword || '').trim();
          if (!kw) throw new UserError('keyword 不能为空');
          
          log.info('正在智能搜索产品和BUG...');
          
          const result = await zentaoAPI.searchProductBugs(kw, {
            bugKeyword: args.bugKeyword,
            productId: args.productId,
            allStatuses: args.allStatuses
          });
          
          // 根据返回结果类型生成不同的日志信息
          if (result.product && result.bugs) {
            await streamContent({ 
              type: 'text', 
              text: `找到产品 "${result.product.name}"，BUG搜索完成\n` 
            });
            resolve({ 
              content: [{ 
                type: 'text', 
                text: JSON.stringify(result) 
              }] 
            });
          } else if (result.bugs) {
            await streamContent({ type: 'text', text: 'BUG搜索完成\n' });
            resolve({ 
              content: [{ 
                type: 'text', 
                text: JSON.stringify(result) 
              }] 
            });
          } else if (result.products) {
            await streamContent({ 
              type: 'text', 
              text: `找到 ${result.products.length} 个产品，请选择具体产品\n` 
            });
            resolve({ 
              content: [{ 
                type: 'text', 
                text: JSON.stringify(result) 
              }] 
            });
          } else {
            throw new Error('未知的搜索结果格式');
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
