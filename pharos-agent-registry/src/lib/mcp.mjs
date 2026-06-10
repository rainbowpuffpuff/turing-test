// mcp.mjs — minimal, zero-dependency Model Context Protocol (MCP) server over stdio.
// Implements the MCP JSON-RPC 2.0 protocol (protocolVersion 2025-03-26, backward
// compatible with 2024-11-05): initialize, tools/list, tools/call, ping.
// Written for auditability: no external packages, no eval, no shell, no fs writes.
//
// Usage:
//   const server = new McpServer({ name: 'my-skill', version: '1.0.0' });
//   server.tool('tool_name', 'description', { type:'object', properties:{...}, required:[...] }, async (args) => ({...}));
//   server.start();

export class McpServer {
  constructor({ name, version, instructions = '' }) {
    this.info = { name, version };
    this.instructions = instructions;
    this.tools = new Map();
    this._buf = '';
  }

  tool(name, description, inputSchema, handler) {
    this.tools.set(name, { name, description, inputSchema, handler });
    return this;
  }

  start() {
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      this._buf += chunk;
      let idx;
      while ((idx = this._buf.indexOf('\n')) >= 0) {
        const line = this._buf.slice(0, idx).trim();
        this._buf = this._buf.slice(idx + 1);
        if (line) this._handleLine(line);
      }
    });
    process.stdin.on('end', () => process.exit(0));
  }

  _send(obj) {
    process.stdout.write(JSON.stringify(obj) + '\n');
  }

  _reply(id, result) { this._send({ jsonrpc: '2.0', id, result }); }
  _error(id, code, message) { this._send({ jsonrpc: '2.0', id, error: { code, message } }); }

  async _handleLine(line) {
    let msg;
    try { msg = JSON.parse(line); } catch { return this._send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
    const { id, method, params } = msg;
    // Notifications (no id) — acknowledge silently
    if (id === undefined || id === null) return;

    try {
      switch (method) {
        case 'initialize':
          return this._reply(id, {
            protocolVersion: params?.protocolVersion === '2024-11-05' ? '2024-11-05' : '2025-03-26',
            capabilities: { tools: { listChanged: false } },
            serverInfo: this.info,
            instructions: this.instructions,
          });
        case 'ping':
          return this._reply(id, {});
        case 'tools/list':
          return this._reply(id, {
            tools: Array.from(this.tools.values()).map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
          });
        case 'tools/call': {
          const t = this.tools.get(params?.name);
          if (!t) return this._error(id, -32602, `Unknown tool: ${params?.name}`);
          const args = params?.arguments ?? {};
          const errs = validate(t.inputSchema, args);
          if (errs.length) {
            return this._reply(id, { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'invalid_arguments', details: errs }) }], isError: true });
          }
          try {
            const result = await t.handler(args);
            const text = typeof result === 'string' ? result : JSON.stringify(result, jsonBigint, 2);
            return this._reply(id, { content: [{ type: 'text', text }] });
          } catch (e) {
            return this._reply(id, { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: String(e?.message ?? e) }) }], isError: true });
          }
        }
        default:
          return this._error(id, -32601, `Method not found: ${method}`);
      }
    } catch (e) {
      return this._error(id, -32603, `Internal error: ${String(e?.message ?? e)}`);
    }
  }
}

export const jsonBigint = (_k, v) => (typeof v === 'bigint' ? v.toString() : v);

// Minimal JSON-Schema subset validator (type, required, enum, pattern, min/max) —
// enough to give agents actionable input errors without external deps.
export function validate(schema, value, path = '$') {
  const errs = [];
  if (!schema || typeof schema !== 'object') return errs;
  const t = schema.type;
  const typeOk =
    t === undefined ||
    (t === 'object' && value !== null && typeof value === 'object' && !Array.isArray(value)) ||
    (t === 'array' && Array.isArray(value)) ||
    (t === 'string' && typeof value === 'string') ||
    (t === 'number' && typeof value === 'number') ||
    (t === 'integer' && Number.isInteger(value)) ||
    (t === 'boolean' && typeof value === 'boolean');
  if (!typeOk) { errs.push(`${path}: expected ${t}`); return errs; }
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${path}: must be one of ${schema.enum.join(', ')}`);
  if (t === 'string') {
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) errs.push(`${path}: does not match ${schema.pattern}`);
    if (schema.minLength !== undefined && value.length < schema.minLength) errs.push(`${path}: too short`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errs.push(`${path}: too long`);
  }
  if (t === 'number' || t === 'integer') {
    if (schema.minimum !== undefined && value < schema.minimum) errs.push(`${path}: below minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errs.push(`${path}: above maximum ${schema.maximum}`);
  }
  if (t === 'object') {
    for (const req of schema.required ?? []) {
      if (value[req] === undefined) errs.push(`${path}.${req}: required`);
    }
    for (const [k, v] of Object.entries(value)) {
      if (schema.properties?.[k]) errs.push(...validate(schema.properties[k], v, `${path}.${k}`));
    }
  }
  if (t === 'array' && schema.items) {
    value.forEach((v, i) => errs.push(...validate(schema.items, v, `${path}[${i}]`)));
  }
  return errs;
}
