#!/usr/bin/env node
// pharos-x402-buyer — MCP server
// Give any AI agent the ability to PAY for x402-protected resources on Pharos.
// Implements the buyer side of the HTTP 402 flow from the Pharos developer
// guide: fetch → parse PAYMENT-REQUIRED → policy check → pay on-chain
// (native PHRS or ERC-20) → retry with PAYMENT-SIGNATURE → return content.
//
// Safety: spending is governed by an explicit per-call allowance plus an
// optional session budget (X402_SESSION_BUDGET, in USD-equivalent units of
// the asset's human amount). The skill never spends more than allowed.
//
// Tools:
//   fetch_with_x402   — full closed-loop: fetch, pay if 402 (within allowance), return content
//   parse_requirements — decode a PAYMENT-REQUIRED header without paying
//   pay_requirements  — execute the on-chain payment for given requirements
//   spending_report   — session spend log for auditability
import { McpServer } from './lib/mcp.mjs';
import { encodeCall, parseUnits, formatUnits, checksum } from './lib/evm.mjs';
import { getNetwork, rpcFor, walletFor, txLink } from './lib/pharos.mjs';

const VERSION = '1.0.0';
const unb64 = (s) => JSON.parse(Buffer.from(s, 'base64').toString('utf8'));
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64');

// session spend ledger (in-memory)
const ledger = [];
function sessionSpent(assetKey) {
  return ledger.filter((e) => e.assetKey === assetKey).reduce((a, e) => a + e.amountHuman, 0);
}

function netNameFromId(networkId) {
  if (networkId === 'eip155:688689') return 'atlantic-testnet';
  if (networkId === 'eip155:1672') return 'mainnet';
  throw new Error(`unsupported x402 network ${networkId} — this skill targets Pharos (eip155:688689 / eip155:1672)`);
}

async function payOnChain(req, networkName) {
  const wallet = walletFor(networkName);
  const need = BigInt(req.maxAmountRequired);
  if (req.asset === 'native') {
    const { hash } = await wallet.sendTx({ to: req.payTo, value: need });
    await wallet.rpc.waitReceipt(hash);
    return { txHash: hash, payer: wallet.address };
  }
  const data = encodeCall('transfer(address,uint256)', [req.payTo, need]);
  const { hash } = await wallet.sendTx({ to: req.asset, data });
  const rcpt = await wallet.rpc.waitReceipt(hash);
  if (rcpt.status !== '0x1') throw new Error('token transfer reverted');
  return { txHash: hash, payer: wallet.address };
}

function checkAllowance(req, maxPayment) {
  const human = Number(formatUnits(BigInt(req.maxAmountRequired), req.assetDecimals ?? 18));
  if (human > maxPayment) {
    return { allowed: false, reason: `price ${human} ${req.assetSymbol ?? ''} exceeds maxPayment ${maxPayment}` };
  }
  const budget = Number(process.env.X402_SESSION_BUDGET ?? Infinity);
  const assetKey = `${req.network}:${req.asset}`;
  if (sessionSpent(assetKey) + human > budget) {
    return { allowed: false, reason: `session budget ${budget} would be exceeded (already spent ${sessionSpent(assetKey)})` };
  }
  return { allowed: true, human, assetKey };
}

const server = new McpServer({
  name: 'pharos-x402-buyer',
  version: VERSION,
  instructions: 'Pay for x402 (HTTP 402 Payment Required) resources on Pharos. Always set maxPayment to cap spend per call. Requires PHAROS_PRIVATE_KEY for a funded wallet.',
});

// ---------------------------------------------------------------- parse_requirements
server.tool(
  'parse_requirements',
  'Decode an x402 PAYMENT-REQUIRED header (base64) or 402 response body into a readable payment quote WITHOUT paying. Use this to inspect price before authorizing.',
  {
    type: 'object',
    properties: {
      header: { type: 'string', description: 'base64 PAYMENT-REQUIRED header value' },
      body: { type: 'object', description: 'alternative: parsed 402 JSON body containing a requirements field' },
    },
  },
  async ({ header, body }) => {
    const req = header ? unb64(header) : body?.requirements ?? body;
    if (!req?.maxAmountRequired) return { ok: false, error: 'no x402 requirements found' };
    const human = formatUnits(BigInt(req.maxAmountRequired), req.assetDecimals ?? 18);
    return {
      ok: true,
      requirements: req,
      quote: {
        price: `${human} ${req.assetSymbol ?? (req.asset === 'native' ? 'native' : req.asset)}`,
        payTo: req.payTo,
        network: req.network,
        resource: req.resource,
        description: req.description ?? '',
        expiresAt: req.validUntil ? new Date(req.validUntil * 1000).toISOString() : null,
      },
    };
  }
);

// ---------------------------------------------------------------- pay_requirements
server.tool(
  'pay_requirements',
  'Execute the on-chain payment for a parsed x402 requirements object. Enforces maxPayment (human units of the asset). Returns the txHash and the PAYMENT-SIGNATURE header to retry the request with.',
  {
    type: 'object',
    properties: {
      requirements: { type: 'object' },
      maxPayment: { type: 'number', minimum: 0, description: 'hard cap in human asset units (e.g. 0.05). REQUIRED safety rail.' },
    },
    required: ['requirements', 'maxPayment'],
  },
  async ({ requirements: req, maxPayment }) => {
    const netName = netNameFromId(req.network);
    if (req.validUntil && Math.floor(Date.now() / 1000) > req.validUntil) {
      return { ok: false, error: 'requirements expired — re-fetch the resource for fresh requirements' };
    }
    const allow = checkAllowance(req, maxPayment);
    if (!allow.allowed) return { ok: false, error: allow.reason, paid: false };
    const { txHash, payer } = await payOnChain(req, netName);
    ledger.push({ ts: Date.now(), assetKey: allow.assetKey, amountHuman: allow.human, txHash, resource: req.resource });
    return {
      ok: true,
      paid: true,
      txHash,
      payer,
      explorer: txLink(txHash, netName),
      paymentSignatureHeader: b64({ nonce: req.nonce, txHash, payer }),
      note: 'Retry the original request with header PAYMENT-SIGNATURE set to paymentSignatureHeader.',
    };
  }
);

// ---------------------------------------------------------------- fetch_with_x402
server.tool(
  'fetch_with_x402',
  'Closed-loop x402 fetch: GET the URL; if it returns 402 with Pharos payment requirements, validate price against maxPayment, pay on-chain, retry with proof, and return the unlocked content. The complete "agent buys data" primitive.',
  {
    type: 'object',
    properties: {
      url: { type: 'string', pattern: '^https?://', description: 'resource URL' },
      maxPayment: { type: 'number', minimum: 0, description: 'hard cap in human asset units. REQUIRED safety rail.' },
      method: { type: 'string', enum: ['GET', 'POST'], description: 'default GET' },
      requestBody: { type: 'string', description: 'optional body for POST' },
      headers: { type: 'object', description: 'extra request headers' },
    },
    required: ['url', 'maxPayment'],
  },
  async ({ url, maxPayment, method = 'GET', requestBody, headers = {} }) => {
    const doFetch = async (extra = {}) => {
      const res = await fetch(url, {
        method,
        headers: { 'User-Agent': 'pharos-x402-buyer/1.0', ...headers, ...extra },
        body: method === 'POST' ? requestBody : undefined,
      });
      const text = await res.text();
      return { status: res.status, headers: Object.fromEntries(res.headers.entries()), text };
    };

    const first = await doFetch();
    if (first.status !== 402) {
      return { ok: true, paid: false, status: first.status, content: first.text.slice(0, 100000), note: 'resource was not payment-gated (or already authorized)' };
    }

    // parse requirements from header or body
    let req = null;
    const hdr = first.headers['payment-required'];
    if (hdr) { try { req = unb64(hdr); } catch {} }
    if (!req) { try { const j = JSON.parse(first.text); req = j.requirements ?? j; } catch {} }
    if (!req?.maxAmountRequired) return { ok: false, error: '402 received but no parseable x402 requirements', body: first.text.slice(0, 2000) };

    const netName = netNameFromId(req.network);
    const allow = checkAllowance(req, maxPayment);
    if (!allow.allowed) {
      return { ok: false, paid: false, error: allow.reason, quote: `${formatUnits(BigInt(req.maxAmountRequired), req.assetDecimals ?? 18)} ${req.assetSymbol ?? req.asset}` };
    }

    const { txHash, payer } = await payOnChain(req, netName);
    ledger.push({ ts: Date.now(), assetKey: allow.assetKey, amountHuman: allow.human, txHash, resource: req.resource ?? url });

    const second = await doFetch({ 'PAYMENT-SIGNATURE': b64({ nonce: req.nonce, txHash, payer }) });
    const receiptHdr = second.headers['payment-response'];
    return {
      ok: second.status === 200,
      paid: true,
      txHash,
      explorer: txLink(txHash, netName),
      pricePaid: `${allow.human} ${req.assetSymbol ?? req.asset}`,
      status: second.status,
      content: second.text.slice(0, 100000),
      settlementReceipt: receiptHdr ? unb64(receiptHdr) : null,
    };
  }
);

// ---------------------------------------------------------------- spending_report
server.tool(
  'spending_report',
  'Report all x402 payments made in this session: amounts, resources, tx hashes. Use for agent accounting and budget audits.',
  { type: 'object', properties: {} },
  async () => {
    const byAsset = {};
    for (const e of ledger) {
      byAsset[e.assetKey] = (byAsset[e.assetKey] ?? 0) + e.amountHuman;
    }
    return {
      ok: true,
      payments: ledger.map((e) => ({ at: new Date(e.ts).toISOString(), amount: e.amountHuman, asset: e.assetKey, resource: e.resource, txHash: e.txHash })),
      totals: byAsset,
      sessionBudget: process.env.X402_SESSION_BUDGET ?? 'unlimited',
    };
  }
);

server.start();
