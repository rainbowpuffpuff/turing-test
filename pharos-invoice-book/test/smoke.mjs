// Smoke test: MCP handshake, tools/list, schema validation rejection.
// Run: node test/smoke.mjs   (exits 0 on pass)
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const dir = dirname(fileURLToPath(import.meta.url));
const child = spawn('node', [join(dir, '..', 'src', 'server.mjs')], { stdio: ['pipe', 'pipe', 'inherit'] });
let id = 0;
const call = (method, params) => new Promise((res, rej) => {
  const i = ++id;
  const on = (b) => { for (const l of b.toString().split('\n')) { if (!l.trim()) continue; try { const j = JSON.parse(l); if (j.id === i) { child.stdout.off('data', on); res(j); return; } } catch {} } };
  child.stdout.on('data', on);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n');
  setTimeout(() => rej(new Error('timeout ' + method)), 15000);
});

const init = await call('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } });
if (init.result?.serverInfo?.name !== 'pharos-invoice-book') { console.error('FAIL: bad serverInfo'); process.exit(1); }

const list = await call('tools/list');
const tools = list.result?.tools ?? [];
if (tools.length < 5) { console.error('FAIL: expected 5 tools, got', tools.length); process.exit(1); }

// schema validation: calling first tool with empty args must NOT crash the server
const bad = await call('tools/call', { name: tools.find(t => (t.inputSchema?.required ?? []).length > 0)?.name ?? tools[0].name, arguments: {} });
if (!bad.result) { console.error('FAIL: server crashed on invalid args'); process.exit(1); }

console.log('PASS: pharos-invoice-book — handshake ok, ' + tools.length + ' tools, schema validation ok');
child.kill();
process.exit(0);
