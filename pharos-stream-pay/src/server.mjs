#!/usr/bin/env node
// pharos-stream-pay — MCP server
// Per-second native payment streams on Pharos: pay an agent continuously
// while it works; the agent withdraws vested funds at any time.
// Wraps the StreamPay contract (contracts/StreamPay.sol, deployed on
// Atlantic testnet — address in assets/deployments.json or PHAROS_STREAMPAY_ADDRESS).
//
// Tools:
//   open_stream     — start a linear vesting stream to a recipient
//   stream_status   — live vested / withdrawable / remaining amounts
//   withdraw_vested — recipient pulls vested funds
//   top_up          — payer extends the stream with more funds
//   cancel_stream   — either party cancels; fair split at the second
//   quote_stream    — plan a stream (rate per second/minute/hour) before opening
import { McpServer } from './lib/mcp.mjs';
import { encodeCall, abiDecode, parseUnits, formatUnits } from './lib/evm.mjs';
import { rpcFor, walletFor, txLink, getNetwork } from './lib/pharos.mjs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const VERSION = '1.0.0';
const __dir = dirname(fileURLToPath(import.meta.url));

function streamAddress(network) {
  if (process.env.PHAROS_STREAMPAY_ADDRESS) return process.env.PHAROS_STREAMPAY_ADDRESS;
  try {
    const dep = JSON.parse(readFileSync(join(__dir, '..', 'assets', 'deployments.json'), 'utf8'));
    const net = getNetwork(network).name;
    if (dep[net]?.StreamPay) return dep[net].StreamPay;
  } catch {}
  throw new Error('StreamPay address unknown: set PHAROS_STREAMPAY_ADDRESS or assets/deployments.json');
}

async function sendAndReport(wallet, to, data, value = 0n, network) {
  const { hash } = await wallet.sendTx({ to, data, value });
  const rcpt = await wallet.rpc.waitReceipt(hash);
  return { ok: rcpt.status === '0x1', txHash: hash, gasUsed: Number(rcpt.gasUsed), explorer: txLink(hash, network), receipt: rcpt };
}

const server = new McpServer({
  name: 'pharos-stream-pay',
  version: VERSION,
  instructions: 'Continuous per-second payment streams for working agents on Pharos. Open, monitor, withdraw, top-up, cancel. Write ops need PHAROS_PRIVATE_KEY.',
});

// ---------------------------------------------------------------- quote_stream
server.tool(
  'quote_stream',
  'Plan a stream before opening: given total amount and duration, returns the per-second/minute/hour rate and end time. Pure math, no chain interaction.',
  {
    type: 'object',
    properties: {
      amount: { type: 'string', pattern: '^[0-9]+(\\.[0-9]+)?$', description: 'total to stream, human units' },
      durationMinutes: { type: 'number', minimum: 0.1 },
    },
    required: ['amount', 'durationMinutes'],
  },
  async ({ amount, durationMinutes }) => {
    const wei = parseUnits(amount, 18);
    const secs = Math.round(durationMinutes * 60);
    const perSec = wei / BigInt(secs);
    return {
      ok: true,
      total: amount,
      durationSeconds: secs,
      ratePerSecond: formatUnits(perSec, 18),
      ratePerMinute: formatUnits(perSec * 60n, 18),
      ratePerHour: formatUnits(perSec * 3600n, 18),
      endsAt: new Date(Date.now() + secs * 1000).toISOString(),
    };
  }
);

// ---------------------------------------------------------------- open_stream
server.tool(
  'open_stream',
  'Open a payment stream: lock `amount` (human units of native PHRS) vesting linearly to `recipient` over `durationMinutes`, starting now.',
  {
    type: 'object',
    properties: {
      recipient: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
      amount: { type: 'string', pattern: '^[0-9]+(\\.[0-9]+)?$' },
      durationMinutes: { type: 'number', minimum: 0.1 },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] },
    },
    required: ['recipient', 'amount', 'durationMinutes'],
  },
  async ({ recipient, amount, durationMinutes, network }) => {
    const wallet = walletFor(network);
    const addr = streamAddress(network);
    const stop = Math.floor(Date.now() / 1000) + Math.round(durationMinutes * 60);
    const data = encodeCall('create(address,uint40,uint40)', [recipient, 0, stop]);
    const res = await sendAndReport(wallet, addr, data, parseUnits(amount, 18), network);
    if (!res.ok) return { ok: false, error: 'create reverted', ...res };
    const created = res.receipt.logs?.find((l) => l.address.toLowerCase() === addr.toLowerCase());
    const id = created ? Number(BigInt(created.topics[1])) : null;
    return { ok: true, streamId: id, contract: addr, payer: wallet.address, recipient, total: amount, endsAt: new Date(stop * 1000).toISOString(), txHash: res.txHash, explorer: res.explorer };
  }
);

// ---------------------------------------------------------------- stream_status
server.tool(
  'stream_status',
  'Live status of a stream: vested so far, withdrawable now, withdrawn, remaining, progress %.',
  { type: 'object', properties: { streamId: { type: 'integer', minimum: 0 }, network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] } }, required: ['streamId'] },
  async ({ streamId, network }) => {
    const rpc = rpcFor(network);
    const addr = streamAddress(network);
    const out = await rpc.ethCall(addr, encodeCall('get(uint256)', [streamId]));
    if (!out || out === '0x') return { ok: false, error: 'stream not found' };
    const [payer, recipient, deposit, withdrawn, start, stop, cancelled] = abiDecode(
      ['address', 'address', 'uint96', 'uint96', 'uint40', 'uint40', 'bool'], out
    );
    const wOut = await rpc.ethCall(addr, encodeCall('withdrawable(uint256)', [streamId]));
    const withdrawable = abiDecode(['uint256'], wOut)[0];
    const now = Math.floor(Date.now() / 1000);
    const progress = Math.min(100, Math.max(0, ((now - Number(start)) / (Number(stop) - Number(start))) * 100));
    return {
      ok: true,
      streamId,
      payer, recipient,
      deposit: formatUnits(deposit, 18),
      withdrawn: formatUnits(withdrawn, 18),
      withdrawableNow: formatUnits(withdrawable, 18),
      start: new Date(Number(start) * 1000).toISOString(),
      stop: new Date(Number(stop) * 1000).toISOString(),
      progressPct: cancelled ? null : Number(progress.toFixed(2)),
      cancelled,
    };
  }
);

// ---------------------------------------------------------------- withdraw_vested
server.tool(
  'withdraw_vested',
  'As the stream recipient, withdraw everything vested so far.',
  { type: 'object', properties: { streamId: { type: 'integer', minimum: 0 }, network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] } }, required: ['streamId'] },
  async ({ streamId, network }) => {
    const wallet = walletFor(network);
    const res = await sendAndReport(wallet, streamAddress(network), encodeCall('withdraw(uint256)', [streamId]), 0n, network);
    return res.ok ? { ok: true, streamId, txHash: res.txHash, explorer: res.explorer } : { ok: false, error: 'withdraw reverted (not recipient? nothing vested?)', ...res };
  }
);

// ---------------------------------------------------------------- top_up
server.tool(
  'top_up',
  'As the payer, add funds to a live stream — extends its end time at the same vesting rate.',
  {
    type: 'object',
    properties: {
      streamId: { type: 'integer', minimum: 0 },
      amount: { type: 'string', pattern: '^[0-9]+(\\.[0-9]+)?$' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] },
    },
    required: ['streamId', 'amount'],
  },
  async ({ streamId, amount, network }) => {
    const wallet = walletFor(network);
    const res = await sendAndReport(wallet, streamAddress(network), encodeCall('topUp(uint256)', [streamId]), parseUnits(amount, 18), network);
    return res.ok ? { ok: true, streamId, added: amount, txHash: res.txHash, explorer: res.explorer } : { ok: false, error: 'topUp reverted (not payer? cancelled?)', ...res };
  }
);

// ---------------------------------------------------------------- cancel_stream
server.tool(
  'cancel_stream',
  'Cancel a stream (payer or recipient). Recipient receives vested-so-far; payer gets the remainder back. Fair to-the-second settlement.',
  { type: 'object', properties: { streamId: { type: 'integer', minimum: 0 }, network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] } }, required: ['streamId'] },
  async ({ streamId, network }) => {
    const wallet = walletFor(network);
    const res = await sendAndReport(wallet, streamAddress(network), encodeCall('cancel(uint256)', [streamId]), 0n, network);
    return res.ok ? { ok: true, streamId, txHash: res.txHash, explorer: res.explorer } : { ok: false, error: 'cancel reverted (not a party? already cancelled?)', ...res };
  }
);

server.start();
