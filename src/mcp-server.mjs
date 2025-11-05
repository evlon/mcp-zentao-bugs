import { FastMCP, UserError } from 'fastmcp';
import { z } from 'zod';

// ---- Env & Config ----
const REQUIRED_ENVS = ['ZENTAO_BASE_URL', 'ZENTAO_ACCOUNT', 'ZENTAO_PASSWORD', 'PORT'];
for (const k of REQUIRED_ENVS) {
  if (!process.env[k] || String(process.env[k]).trim() === '') {
    console.error(`ENV ${k} is required`);
    process.exit(1);
  }
}
const BASE = process.env.ZENTAO_BASE_URL.replace(/\/$/, '');
const ACCOUNT = process.env.ZENTAO_ACCOUNT;
const PASSWORD = process.env.ZENTAO_PASSWORD;
const PORT = Number(process.env.PORT || 3000);

let TOKEN = '';

async function loginZenTao() {
  const url = `${BASE}/api.php/v1/tokens`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: ACCOUNT, password: PASSWORD })
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Login failed ${resp.status}: ${text}`);
  }
  const json = await resp.json();
  if (!json?.token) throw new Error('Login response missing token');
  TOKEN = json.token;
}

function authHeaders() {
  return { 'Content-Type': 'application/json', 'Token': TOKEN };
}

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
  name: 'fuzzySearchProducts',
  description: '模糊匹配产品名，返回 ≤10 条',
  parameters: z.object({ keyword: z.string() }),
  annotations: { title: 'Fuzzy Search Products', readOnlyHint: true, openWorldHint: true },
  execute: async (args, { log, streamContent }) => {
    // serialize via queue
    return await new Promise((resolve) => {
      enqueue(async () => {
        try {
          const kw = (args.keyword || '').trim();
          if (!kw) throw new UserError('keyword 不能为空');
          log.info('正在模糊搜索产品...');

          const url = new URL(`${BASE}/api.php/v1/products`);
          url.searchParams.set('page', '1');
          url.searchParams.set('limit', '100');
          const resp = await fetch(url, { headers: authHeaders() });
          if (!resp.ok) throw new Error(`GET /products failed: ${resp.status}`);
          const data = await resp.json();
          const list = Array.isArray(data.products) ? data.products : [];
          const filtered = list.filter(p => String(p.name || '').toLowerCase().includes(kw.toLowerCase())).slice(0, 10);

          // 精简返回字段：只保留 ID 和名称
          const simplifiedProducts = filtered.map(p => ({
            id: p.id,
            name: p.name
          }));

          await streamContent({ type: 'text', text: '搜索完成\n' });
          resolve({ content: [{ type: 'text', text: JSON.stringify({ products: simplifiedProducts }) }] });
        } catch (err) {
          resolve({ content: [{ type: 'text', text: JSON.stringify({ error: err instanceof UserError ? err.message : String(err?.message || err) }) }] });
        }
      });
    });
  },
});

server.addTool({
  name: 'fuzzySearchBugs',
  description: '返回该产品下按标题模糊匹配 ≤10 条。默认只返回状态为"激活"的BUG，除非指定 allStatuses=true 才返回所有状态',
  parameters: z.object({ 
    productId: z.number(), 
    keyword: z.string().optional(),
    allStatuses: z.boolean().optional().default(false)
  }),
  annotations: { title: 'Fuzzy Search Bugs', readOnlyHint: true, openWorldHint: true },
  execute: async (args, { log, streamContent }) => {
    return await new Promise((resolve) => {
      enqueue(async () => {
        try {
          if (!Number.isFinite(args.productId)) throw new UserError('productId 必须为数字');
          log.info('正在模糊搜索 Bug...');
          const url = new URL(`${BASE}/api.php/v1/products/${args.productId}/bugs`);
          url.searchParams.set('page', '1');
          url.searchParams.set('limit', '100');
          const resp = await fetch(url, { headers: authHeaders() });
          if (!resp.ok) throw new Error(`GET /products/${args.productId}/bugs failed: ${resp.status}`);
          const data = await resp.json();
          let bugs = Array.isArray(data.bugs) ? data.bugs : [];
          
          // 默认只返回状态为"激活"的BUG，除非明确要求所有状态
          if (!args.allStatuses) {
            bugs = bugs.filter(b => {
              const status = b.status?.name || b.status?.code || b.status;
              return status === 'active' || status === '激活' || status === 'Active';
            });
          }
          
          if (args.keyword) {
            const kw = String(args.keyword).toLowerCase();
            bugs = bugs.filter(b => String(b.title || '').toLowerCase().includes(kw));
          }
          bugs = bugs.slice(0, 10);

          // 精简返回字段：只保留修改代码所需的关键信息
          const simplifiedBugs = bugs.map(b => ({
            id: b.id,
            title: b.title,
            severity: b.severity,
            status: b.status?.name || b.status?.code,
            assignedTo: b.assignedTo?.realname || b.assignedTo?.account
          }));

          await streamContent({ type: 'text', text: '搜索完成\n' });
          resolve({ content: [{ type: 'text', text: JSON.stringify({ bugs: simplifiedBugs }) }] });
        } catch (err) {
          resolve({ content: [{ type: 'text', text: JSON.stringify({ error: err instanceof UserError ? err.message : String(err?.message || err) }) }] });
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
          const resp = await fetch(`${BASE}/api.php/v1/bugs/${args.bugId}`, { headers: authHeaders() });
          if (!resp.ok) throw new Error(`GET /bugs/${args.bugId} failed: ${resp.status}`);
          const bug = await resp.json();
          
          // 精简返回字段：只保留修改代码所需的关键信息
          const simplifiedBug = {
            id: bug.id,
            title: bug.title,
            severity: bug.severity,
            priority: bug.pri,
            status: bug.status,
            steps: bug.steps,
            assignedTo: bug.assignedTo,
            openedBy: bug.openedBy,
            product: bug.product,
            type: bug.type
          };

          resolve({ content: [{ type: 'text', text: JSON.stringify({ bug: simplifiedBug }) }] });
        } catch (err) {
          resolve({ content: [{ type: 'text', text: JSON.stringify({ error: err instanceof UserError ? err.message : String(err?.message || err) }) }] });
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
          const body = { resolution: 'fixed', ...(args.comment ? { comment: String(args.comment) } : {}) };
          const resp = await fetch(`${BASE}/api.php/v1/bugs/${args.bugId}/resolve`, {
            method: 'POST', headers: authHeaders(), body: JSON.stringify(body)
          });
          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error(`POST /bugs/${args.bugId}/resolve failed: ${resp.status} ${text}`);
          }
          const result = await resp.json().catch(() => ({}));
          resolve({ content: [{ type: 'text', text: JSON.stringify({ bug: result }) }] });
        } catch (err) {
          resolve({ content: [{ type: 'text', text: JSON.stringify({ error: err instanceof UserError ? err.message : String(err?.message || err) }) }] });
        }
      });
    });
  },
});

// ---- Bootstrap: login then start HTTP streaming (SSE included) ----
try {
  await loginZenTao();
  console.log('Login success. Starting FastMCP httpStream...');
  await server.start({
    transportType: 'httpStream',
    httpStream: { port: PORT },
  });
  console.log(`FastMCP HTTP streaming on :${PORT} (MCP: /mcp, SSE: /sse, Health: /health)`);
} catch (err) {
  console.error('Fatal: login failed:', err?.message || err);
  process.exit(1);
}
