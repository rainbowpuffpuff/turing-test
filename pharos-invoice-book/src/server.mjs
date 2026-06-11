#!/usr/bin/env node
// pharos-invoice-book — MCP server
// On-chain invoicing for the agent economy (RealFi primitive) on Pharos.
// Wraps the InvoiceBook contract: issue invoices in native PHRS or any ERC-20,
// accept partial payments, track status, cancel — every event indexable.
//
// Tools:
//   create_invoice   — issue an invoice (native or token, open or payer-restricted)
//   pay_invoice      — pay full/partial (handles ERC-20 approve automatically)
//   invoice_status   — read state, remaining due, payment history (from logs)
//   cancel_invoice   — issuer cancels
//   list_my_invoices — scan recent logs for invoices issued by an address
import { McpServer } from './lib/mcp.mjs';
import { encodeCall, abiDecode, abiDecodeStruct, parseUnits, formatUnits, keccak, bytesToHex, utf8, checksum } from './lib/evm.mjs';
import { rpcFor, walletFor, txLink, getNetwork, resolveToken } from './lib/pharos.mjs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const VERSION = '1.0.0';
const __dir = dirname(fileURLToPath(import.meta.url));
const ZERO = '0x0000000000000000000000000000000000000000';

function bookAddress(network) {
  if (process.env.PHAROS_INVOICEBOOK_ADDRESS) return process.env.PHAROS_INVOICEBOOK_ADDRESS;
  try {
    const dep = JSON.parse(readFileSync(join(__dir, '..', 'assets', 'deployments.json'), 'utf8'));
    const net = getNetwork(network).name;
    if (dep[net]?.InvoiceBook) return dep[net].InvoiceBook;
  } catch {}
  throw new Error('InvoiceBook address unknown: set PHAROS_INVOICEBOOK_ADDRESS or assets/deployments.json');
}

const STATUS = ['Unpaid', 'PartiallyPaid', 'Paid', 'Cancelled'];
const TOPIC_CREATED = bytesToHex(keccak(utf8('InvoiceCreated(uint256,address,address,address,uint256,uint40,bytes32,string)')));
const TOPIC_PAID = bytesToHex(keccak(utf8('InvoicePaid(uint256,address,uint256,uint256,bool)')));

async function sendAndReport(wallet, to, data, value = 0n, network) {
  const { hash } = await wallet.sendTx({ to, data, value });
  const rcpt = await wallet.rpc.waitReceipt(hash);
  return { ok: rcpt.status === '0x1', txHash: hash, gasUsed: Number(rcpt.gasUsed), explorer: txLink(hash, network), receipt: rcpt };
}

async function tokenMeta(rpc, address) {
  const [symRaw, decRaw] = await Promise.all([
    rpc.ethCall(address, encodeCall('symbol()')),
    rpc.ethCall(address, encodeCall('decimals()')),
  ]);
  return { symbol: abiDecode(['string'], symRaw)[0], decimals: Number(abiDecode(['uint256'], decRaw)[0]) };
}

const server = new McpServer({
  name: 'pharos-invoice-book',
  version: VERSION,
  instructions: 'Issue, pay, and track on-chain invoices on Pharos (native PHRS or ERC-20 like USDC). The B2B/agent-commerce billing primitive. Write ops need PHAROS_PRIVATE_KEY.',
});

// ---------------------------------------------------------------- create_invoice
server.tool(
  'create_invoice',
  'Issue an on-chain invoice. asset: "native" | symbol (USDC/USDT/WPHRS) | 0x token address. payer optional (restricts who may pay). amount in human units. memo: short reference like "INV-2026-001". memoContent: full invoice doc — hashed on-chain.',
  {
    type: 'object',
    properties: {
      amount: { type: 'string', pattern: '^[0-9]+(\\.[0-9]+)?$' },
      asset: { type: 'string', description: 'default "native"' },
      payer: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$', description: 'optional restricted payer' },
      dueInDays: { type: 'number', minimum: 0, description: 'informational due date (default 7)' },
      memo: { type: 'string', maxLength: 64, description: 'short reference, stored on-chain' },
      memoContent: { type: 'string', description: 'full invoice document (line items etc.) — only its keccak hash goes on-chain' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet', 'mantle-sepolia', 'mantle'] },
    },
    required: ['amount', 'memo'],
  },
  async ({ amount, asset = 'native', payer = ZERO, dueInDays = 7, memo, memoContent = '', network }) => {
    const wallet = walletFor(network);
    const addr = bookAddress(network);
    let token = ZERO, decimals = 18, symbol = getNetwork(network).nativeToken;
    if (asset !== 'native') {
      const t = resolveToken(asset, network);
      token = t.address;
      if (t.decimals != null) { decimals = t.decimals; symbol = t.symbol; }
      else { const m = await tokenMeta(wallet.rpc, token); decimals = m.decimals; symbol = m.symbol; }
    }
    const units = parseUnits(amount, decimals);
    const dueDate = Math.floor(Date.now() / 1000) + Math.round(dueInDays * 86400);
    const memoHash = bytesToHex(keccak(utf8(memoContent || memo)));
    const data = encodeCall('create(address,address,uint96,uint40,bytes32,string)', [payer, token, units, dueDate, memoHash, memo]);
    const res = await sendAndReport(wallet, addr, data, 0n, network);
    if (!res.ok) return { ok: false, error: 'create reverted', ...res };
    const created = res.receipt.logs?.find((l) => l.topics?.[0] === TOPIC_CREATED);
    const id = created ? Number(BigInt(created.topics[1])) : null;
    return {
      ok: true, invoiceId: id, contract: addr, issuer: wallet.address,
      amount: `${amount} ${symbol}`, token: token === ZERO ? 'native' : token,
      payerRestriction: payer === ZERO ? 'anyone may pay' : payer,
      dueDate: new Date(dueDate * 1000).toISOString(), memo, memoHash,
      txHash: res.txHash, explorer: res.explorer,
    };
  }
);

// ---------------------------------------------------------------- pay_invoice
server.tool(
  'pay_invoice',
  'Pay an invoice (full or partial). For ERC-20 invoices this auto-approves the InvoiceBook contract if allowance is insufficient. amount optional — defaults to the full remaining balance.',
  {
    type: 'object',
    properties: {
      invoiceId: { type: 'integer', minimum: 0 },
      amount: { type: 'string', pattern: '^[0-9]+(\\.[0-9]+)?$', description: 'human units; omit to pay remaining in full' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet', 'mantle-sepolia', 'mantle'] },
    },
    required: ['invoiceId'],
  },
  async ({ invoiceId, amount, network }) => {
    const wallet = walletFor(network);
    const addr = bookAddress(network);
    const raw = await wallet.rpc.ethCall(addr, encodeCall('get(uint256)', [invoiceId]));
    if (!raw || raw === '0x') return { ok: false, error: 'invoice not found' };
    const inv = abiDecodeStruct(['address', 'address', 'address', 'uint96', 'uint96', 'uint40', 'uint8', 'bytes32', 'string'], raw);
    const [issuer, payerR, token, total, paid, , statusN] = inv;
    if (STATUS[Number(statusN)] === 'Paid') return { ok: false, error: 'invoice already paid in full' };
    if (STATUS[Number(statusN)] === 'Cancelled') return { ok: false, error: 'invoice was cancelled' };

    const native = token === ZERO || token.toLowerCase() === ZERO;
    let decimals = 18, symbol = getNetwork(network).nativeToken;
    if (!native) { const m = await tokenMeta(wallet.rpc, token); decimals = m.decimals; symbol = m.symbol; }
    const remaining = BigInt(total) - BigInt(paid);
    const units = amount ? parseUnits(amount, decimals) : remaining;
    if (units > remaining) return { ok: false, error: `overpay: remaining is ${formatUnits(remaining, decimals)} ${symbol}` };

    if (native) {
      const res = await sendAndReport(wallet, addr, encodeCall('payNative(uint256)', [invoiceId]), units, network);
      return res.ok
        ? { ok: true, invoiceId, paid: `${formatUnits(units, decimals)} ${symbol}`, settled: units === remaining, txHash: res.txHash, explorer: res.explorer }
        : { ok: false, error: 'payNative reverted (wrong payer? cancelled?)', ...res };
    }
    // ERC-20: ensure allowance
    const allowRaw = await wallet.rpc.ethCall(token, encodeCall('allowance(address,address)', [wallet.address, addr]));
    const allowance = abiDecode(['uint256'], allowRaw)[0];
    if (allowance < units) {
      const ap = await sendAndReport(wallet, token, encodeCall('approve(address,uint256)', [addr, units]), 0n, network);
      if (!ap.ok) return { ok: false, error: 'token approve failed', ...ap };
    }
    const res = await sendAndReport(wallet, addr, encodeCall('payToken(uint256,uint96)', [invoiceId, units]), 0n, network);
    return res.ok
      ? { ok: true, invoiceId, paid: `${formatUnits(units, decimals)} ${symbol}`, settled: units === remaining, txHash: res.txHash, explorer: res.explorer }
      : { ok: false, error: 'payToken reverted (balance? wrong payer?)', ...res };
  }
);

// ---------------------------------------------------------------- invoice_status
server.tool(
  'invoice_status',
  'Read full invoice state + on-chain payment history (scanned from InvoicePaid logs).',
  {
    type: 'object',
    properties: {
      invoiceId: { type: 'integer', minimum: 0 },
      historyBlocks: { type: 'integer', minimum: 0, maximum: 2000000, description: 'how many recent blocks to scan for payments (default 200000)' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet', 'mantle-sepolia', 'mantle'] },
    },
    required: ['invoiceId'],
  },
  async ({ invoiceId, historyBlocks = 200000, network }) => {
    const rpc = rpcFor(network);
    const addr = bookAddress(network);
    const raw = await rpc.ethCall(addr, encodeCall('get(uint256)', [invoiceId]));
    if (!raw || raw === '0x') return { ok: false, error: 'invoice not found' };
    const [issuer, payer, token, total, paid, dueDate, statusN, memoHash, memo] =
      abiDecodeStruct(['address', 'address', 'address', 'uint96', 'uint96', 'uint40', 'uint8', 'bytes32', 'string'], raw);
    const native = token === ZERO;
    let decimals = 18, symbol = getNetwork(network).nativeToken;
    if (!native) { const m = await tokenMeta(rpc, token); decimals = m.decimals; symbol = m.symbol; }

    // payment history from logs
    const latest = await rpc.blockNumber();
    const fromBlock = Math.max(0, latest - historyBlocks);
    const idTopic = '0x' + BigInt(invoiceId).toString(16).padStart(64, '0');
    let history = [];
    try {
      const logs = await rpc.getLogsChunked({ address: addr, topics: [TOPIC_PAID, idTopic], fromBlock });
      history = logs.map((l) => {
        const [amt, totalPaid, settled] = abiDecode(['uint256', 'uint256', 'bool'], l.data);
        return { payer: checksum('0x' + l.topics[2].slice(26)), amount: formatUnits(amt, decimals), totalPaidAfter: formatUnits(totalPaid, decimals), settled, txHash: l.transactionHash, block: Number(l.blockNumber) };
      });
    } catch {}

    return {
      ok: true, invoiceId, contract: addr,
      issuer, payerRestriction: payer === ZERO ? null : payer,
      asset: native ? 'native' : token, symbol,
      total: formatUnits(total, decimals), paid: formatUnits(paid, decimals),
      remaining: formatUnits(BigInt(total) - BigInt(paid), decimals),
      dueDate: Number(dueDate) ? new Date(Number(dueDate) * 1000).toISOString() : null,
      overdue: Number(dueDate) ? Date.now() / 1000 > Number(dueDate) && STATUS[Number(statusN)] !== 'Paid' : false,
      status: STATUS[Number(statusN)],
      memo, memoHash,
      payments: history,
    };
  }
);

// ---------------------------------------------------------------- cancel_invoice
server.tool(
  'cancel_invoice',
  'Cancel an invoice you issued (only unpaid/partially-paid can be cancelled; received funds are kept — they were forwarded on payment).',
  { type: 'object', properties: { invoiceId: { type: 'integer', minimum: 0 }, network: { type: 'string', enum: ['atlantic-testnet', 'mainnet', 'mantle-sepolia', 'mantle'] } }, required: ['invoiceId'] },
  async ({ invoiceId, network }) => {
    const wallet = walletFor(network);
    const res = await sendAndReport(wallet, bookAddress(network), encodeCall('cancel(uint256)', [invoiceId]), 0n, network);
    return res.ok ? { ok: true, invoiceId, txHash: res.txHash, explorer: res.explorer } : { ok: false, error: 'cancel reverted (not issuer? already settled?)', ...res };
  }
);

// ---------------------------------------------------------------- list_my_invoices
server.tool(
  'list_my_invoices',
  'List invoices issued by an address (scans InvoiceCreated logs over recent blocks).',
  {
    type: 'object',
    properties: {
      issuer: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$', description: 'defaults to PHAROS_PRIVATE_KEY address' },
      historyBlocks: { type: 'integer', minimum: 0, maximum: 2000000, description: 'default 200000' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet', 'mantle-sepolia', 'mantle'] },
    },
  },
  async ({ issuer, historyBlocks = 200000, network }) => {
    const rpc = rpcFor(network);
    const addr = bookAddress(network);
    if (!issuer) issuer = walletFor(network).address;
    const latest = await rpc.blockNumber();
    const fromBlock = Math.max(0, latest - historyBlocks);
    const issuerTopic = '0x' + issuer.slice(2).toLowerCase().padStart(64, '0');
    const logs = await rpc.getLogsChunked({ address: addr, topics: [TOPIC_CREATED, null, issuerTopic], fromBlock });
    const invoices = logs.map((l) => {
      const [token, amount, dueDate, memoHash, memo] = abiDecode(['address', 'uint256', 'uint40', 'bytes32', 'string'], l.data);
      return { invoiceId: Number(BigInt(l.topics[1])), token: token === ZERO ? 'native' : token, amountUnits: amount.toString(), dueDate: new Date(Number(dueDate) * 1000).toISOString(), memo, txHash: l.transactionHash };
    });
    return { ok: true, issuer: checksum(issuer), count: invoices.length, invoices };
  }
);

server.start();
