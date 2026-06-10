#!/usr/bin/env node
// pharos-x402-merchant — MCP server
// Turn any API/resource into a paid x402 endpoint on Pharos.
// Implements the HTTP 402 "Payment Required" flow described in the Pharos
// developer guide (docs.pharos.xyz/developer-guide/x402): the server returns
// payment requirements; the buyer pays on-chain (native PHRS or ERC-20);
// the merchant verifies the transfer via RPC and unlocks the resource.
//
// Tools:
//   create_payment_requirements — produce a PAYMENT-REQUIRED payload (base64 + JSON)
//   verify_payment              — verify an on-chain payment against requirements
//   settle_and_receipt          — wait for finality, produce a signed receipt
//   start_paywall_server        — run a local demo paywall HTTP server (opt-in, demo only)
//   price_catalog               — express prices in USD/PHRS/token units for agent quoting
import { McpServer } from './lib/mcp.mjs';
import { Rpc, encodeCall, abiDecode, parseUnits, formatUnits, keccak, bytesToHex, utf8, personalSign, privToAddress, checksum } from './lib/evm.mjs';
import { getNetwork, rpcFor, resolveToken, txLink, TOKENS } from './lib/pharos.mjs';

const VERSION = '1.0.0';
const SCHEME = 'exact';
const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64');
const unb64 = (s) => JSON.parse(Buffer.from(s, 'base64').toString('utf8'));

function networkId(net) { return `eip155:${net.chainId}`; }

const server = new McpServer({
  name: 'pharos-x402-merchant',
  version: VERSION,
  instructions: 'Monetize APIs and resources with x402 micro-payments on Pharos. Create payment requirements, verify on-chain payments (native PHRS or ERC-20), and issue signed receipts.',
});

// ---------------------------------------------------------------- create_payment_requirements
server.tool(
  'create_payment_requirements',
  'Create an x402 PaymentRequired object for a resource. Returns both JSON and the base64 header value to send with HTTP 402. amount is a decimal string in token units (e.g. "0.01"). asset is "native" for PHRS or a token symbol/address (e.g. "USDC").',
  {
    type: 'object',
    properties: {
      payTo: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$', description: 'merchant receiving address' },
      amount: { type: 'string', pattern: '^[0-9]+(\\.[0-9]+)?$', description: 'price in human units, e.g. "0.05"' },
      asset: { type: 'string', description: '"native" | token symbol (USDC, USDT, WPHRS...) | 0x token address', },
      resource: { type: 'string', description: 'resource identifier, e.g. "GET /api/report/42"' },
      description: { type: 'string', description: 'human/agent readable description of what is being sold' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'], description: 'default atlantic-testnet' },
      validForSeconds: { type: 'integer', minimum: 60, maximum: 86400, description: 'requirement expiry (default 3600)' },
    },
    required: ['payTo', 'amount', 'resource'],
  },
  async ({ payTo, amount, asset = 'native', resource, description = '', network, validForSeconds = 3600 }) => {
    const net = getNetwork(network);
    let assetInfo, maxAmountRequired;
    if (asset === 'native') {
      assetInfo = { address: 'native', symbol: net.nativeToken, decimals: 18 };
      maxAmountRequired = parseUnits(amount, 18).toString();
    } else {
      const t = resolveToken(asset, network);
      const rpc = rpcFor(network);
      const decimals = t.decimals ?? Number(abiDecode(['uint256'], await rpc.ethCall(t.address, encodeCall('decimals()')))[0]);
      const symbol = t.symbol ?? abiDecode(['string'], await rpc.ethCall(t.address, encodeCall('symbol()')))[0];
      assetInfo = { address: t.address, symbol, decimals };
      maxAmountRequired = parseUnits(amount, decimals).toString();
    }
    const nonce = bytesToHex(keccak(utf8(`${resource}|${payTo}|${Date.now()}|${Math.random()}`))).slice(0, 34);
    const requirements = {
      x402Version: 1,
      scheme: SCHEME,
      network: networkId(net),
      payTo: checksum(payTo),
      asset: assetInfo.address,
      assetSymbol: assetInfo.symbol,
      assetDecimals: assetInfo.decimals,
      maxAmountRequired,
      resource,
      description,
      nonce,
      validUntil: Math.floor(Date.now() / 1000) + validForSeconds,
    };
    return {
      ok: true,
      requirements,
      httpHeader: { 'PAYMENT-REQUIRED': b64(requirements) },
      httpStatus: 402,
      humanPrice: `${amount} ${assetInfo.symbol}`,
      note: 'Return HTTP 402 with this header. The buyer pays on-chain and retries with PAYMENT-SIGNATURE header containing base64({requirementsNonce, txHash, payer}).',
    };
  }
);

// ---------------------------------------------------------------- verify_payment
server.tool(
  'verify_payment',
  'Verify that an on-chain Pharos transaction satisfies an x402 payment requirement. Accepts the requirements object (or its base64) plus the payment proof {txHash}. Checks recipient, asset, amount, confirmation status, and requirement expiry.',
  {
    type: 'object',
    properties: {
      requirements: { type: 'object', description: 'the PaymentRequired object from create_payment_requirements' },
      requirementsB64: { type: 'string', description: 'alternative: base64-encoded requirements (PAYMENT-REQUIRED header value)' },
      txHash: { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$' },
      minConfirmations: { type: 'integer', minimum: 0, maximum: 64, description: 'default 1' },
    },
    required: ['txHash'],
  },
  async ({ requirements, requirementsB64, txHash, minConfirmations = 1 }) => {
    const req = requirements ?? (requirementsB64 ? unb64(requirementsB64) : null);
    if (!req) return { ok: false, error: 'provide requirements or requirementsB64' };
    const netName = req.network === 'eip155:1672' ? 'mainnet' : 'atlantic-testnet';
    const rpc = rpcFor(netName);

    const [tx, receipt, latestHex] = await Promise.all([
      rpc.call('eth_getTransactionByHash', [txHash]),
      rpc.receipt(txHash),
      rpc.call('eth_blockNumber'),
    ]);
    if (!tx) return { ok: false, verified: false, reason: 'transaction not found' };
    if (!receipt) return { ok: false, verified: false, reason: 'transaction not yet mined' };
    if (receipt.status !== '0x1') return { ok: false, verified: false, reason: 'transaction reverted' };

    const confirmations = Number(latestHex) - Number(receipt.blockNumber) + 1;
    if (confirmations < minConfirmations) {
      return { ok: false, verified: false, reason: `only ${confirmations} confirmations (need ${minConfirmations})` };
    }
    if (req.validUntil && Math.floor(Date.now() / 1000) > req.validUntil) {
      return { ok: false, verified: false, reason: 'payment requirement expired' };
    }

    const need = BigInt(req.maxAmountRequired);
    let paid = 0n, payer = checksum(tx.from), correctRecipient = false;

    if (req.asset === 'native') {
      correctRecipient = (tx.to ?? '').toLowerCase() === req.payTo.toLowerCase();
      paid = BigInt(tx.value);
    } else {
      // scan Transfer logs emitted by the asset contract
      for (const log of receipt.logs ?? []) {
        if (log.address.toLowerCase() !== req.asset.toLowerCase()) continue;
        if (log.topics?.[0] !== ERC20_TRANSFER_TOPIC) continue;
        const to = '0x' + log.topics[2].slice(26);
        if (to.toLowerCase() !== req.payTo.toLowerCase()) continue;
        correctRecipient = true;
        paid += BigInt(log.data);
        payer = checksum('0x' + log.topics[1].slice(26));
      }
    }

    if (!correctRecipient) return { ok: false, verified: false, reason: `no transfer to ${req.payTo} found in tx` };
    if (paid < need) {
      return { ok: false, verified: false, reason: `underpaid: got ${formatUnits(paid, req.assetDecimals)} ${req.assetSymbol}, need ${formatUnits(need, req.assetDecimals)}` };
    }

    return {
      ok: true,
      verified: true,
      payer,
      paid: paid.toString(),
      paidHuman: `${formatUnits(paid, req.assetDecimals)} ${req.assetSymbol}`,
      confirmations,
      blockNumber: Number(receipt.blockNumber),
      explorer: txLink(txHash, netName),
      nonce: req.nonce,
    };
  }
);

// ---------------------------------------------------------------- settle_and_receipt
server.tool(
  'settle_and_receipt',
  'After verify_payment succeeds, produce the PAYMENT-RESPONSE settlement object (base64) to return with HTTP 200, optionally signed by the merchant key (PHAROS_PRIVATE_KEY) so buyers can prove purchase later.',
  {
    type: 'object',
    properties: {
      requirements: { type: 'object' },
      txHash: { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$' },
      payer: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
      sign: { type: 'boolean', description: 'sign receipt with PHAROS_PRIVATE_KEY (default true if key present)' },
    },
    required: ['requirements', 'txHash', 'payer'],
  },
  async ({ requirements, txHash, payer, sign }) => {
    const receipt = {
      x402Version: 1,
      scheme: SCHEME,
      network: requirements.network,
      resource: requirements.resource,
      nonce: requirements.nonce,
      txHash,
      payer: checksum(payer),
      payTo: requirements.payTo,
      amount: requirements.maxAmountRequired,
      asset: requirements.asset,
      settledAt: Math.floor(Date.now() / 1000),
    };
    let signature = null, signer = null;
    const wantSign = sign ?? Boolean(process.env.PHAROS_PRIVATE_KEY);
    if (wantSign) {
      if (!process.env.PHAROS_PRIVATE_KEY) return { ok: false, error: 'PHAROS_PRIVATE_KEY required to sign receipts' };
      const msg = `x402-receipt:${receipt.nonce}:${receipt.txHash}:${receipt.payer}`;
      signature = personalSign(msg, process.env.PHAROS_PRIVATE_KEY);
      signer = privToAddress(process.env.PHAROS_PRIVATE_KEY);
    }
    return {
      ok: true,
      receipt,
      signature,
      signer,
      httpHeader: { 'PAYMENT-RESPONSE': b64({ ...receipt, signature, signer }) },
      httpStatus: 200,
    };
  }
);

// ---------------------------------------------------------------- price_catalog
server.tool(
  'price_catalog',
  'Quote a USD price in payable Pharos assets (native PHRS + stable tokens) so agents can choose how to pay. Uses 1 USDC = 1 USD; native quoted only if priceNativeUsd provided (no oracle dependency).',
  {
    type: 'object',
    properties: {
      usd: { type: 'number', minimum: 0, description: 'price in USD' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] },
      priceNativeUsd: { type: 'number', minimum: 0, description: 'optional PHRS/PROS price in USD for native quoting' },
    },
    required: ['usd'],
  },
  async ({ usd, network, priceNativeUsd }) => {
    const net = getNetwork(network);
    const toks = TOKENS[net.name] ?? {};
    const quotes = [];
    for (const sym of ['USDC', 'USDT']) {
      if (toks[sym]) quotes.push({ asset: sym, address: toks[sym].address, amount: usd.toFixed(toks[sym].decimals > 2 ? 6 : 2), units: parseUnits(usd.toFixed(6), toks[sym].decimals).toString() });
    }
    if (priceNativeUsd && priceNativeUsd > 0) {
      const native = usd / priceNativeUsd;
      quotes.push({ asset: net.nativeToken, address: 'native', amount: native.toFixed(8), units: parseUnits(native.toFixed(18), 18).toString() });
    }
    return { ok: true, usd, network: networkId(net), quotes };
  }
);

// ---------------------------------------------------------------- start_paywall_server (demo)
server.tool(
  'start_paywall_server',
  'DEMO: start a local HTTP paywall on 127.0.0.1 that protects a sample resource with x402. Returns the URL. The server enforces: 402 with PAYMENT-REQUIRED → client pays on Pharos → retries with PAYMENT-SIGNATURE → 200 + PAYMENT-RESPONSE. Binds to localhost only and auto-stops after ttlSeconds.',
  {
    type: 'object',
    properties: {
      payTo: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
      amount: { type: 'string', pattern: '^[0-9]+(\\.[0-9]+)?$' },
      asset: { type: 'string' },
      port: { type: 'integer', minimum: 1024, maximum: 65535 },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] },
      ttlSeconds: { type: 'integer', minimum: 10, maximum: 3600, description: 'auto-shutdown (default 600)' },
      resourceBody: { type: 'string', description: 'the protected content to serve (default: sample premium JSON)' },
    },
    required: ['payTo', 'amount'],
  },
  async ({ payTo, amount, asset = 'native', port = 4021, network, ttlSeconds = 600, resourceBody }) => {
    const { createServer } = await import('http');
    const net = getNetwork(network);
    const body = resourceBody ?? JSON.stringify({ premium: true, message: 'Paid content unlocked via x402 on Pharos', timestamp: new Date().toISOString() });

    // requirements are created per-request; verified payments cached by nonce
    const issued = new Map(); // nonce -> requirements
    const paid = new Set();   // nonce already redeemed

    const httpServer = createServer(async (req, res) => {
      try {
        if (req.url !== '/premium') { res.writeHead(404); return res.end('not found. try GET /premium'); }
        const payHeader = req.headers['payment-signature'];
        if (!payHeader) {
          // issue fresh requirements
          const r = await callTool('create_payment_requirements', { payTo, amount, asset, resource: 'GET /premium', description: 'Demo premium resource', network: net.name });
          issued.set(r.requirements.nonce, r.requirements);
          res.writeHead(402, { 'Content-Type': 'application/json', 'PAYMENT-REQUIRED': r.httpHeader['PAYMENT-REQUIRED'] });
          return res.end(JSON.stringify({ error: 'payment required', requirements: r.requirements }));
        }
        const proof = unb64(String(payHeader));
        const reqs = issued.get(proof.nonce);
        if (!reqs) { res.writeHead(400); return res.end(JSON.stringify({ error: 'unknown or expired nonce' })); }
        if (paid.has(proof.nonce)) { res.writeHead(409); return res.end(JSON.stringify({ error: 'payment already redeemed' })); }
        const v = await callTool('verify_payment', { requirements: reqs, txHash: proof.txHash });
        if (!v.verified) { res.writeHead(402); return res.end(JSON.stringify({ error: 'payment not verified', reason: v.reason })); }
        paid.add(proof.nonce);
        const settle = await callTool('settle_and_receipt', { requirements: reqs, txHash: proof.txHash, payer: v.payer, sign: Boolean(process.env.PHAROS_PRIVATE_KEY) });
        res.writeHead(200, { 'Content-Type': 'application/json', 'PAYMENT-RESPONSE': settle.httpHeader['PAYMENT-RESPONSE'] });
        return res.end(body);
      } catch (e) {
        res.writeHead(500); res.end(JSON.stringify({ error: String(e?.message ?? e) }));
      }
    });

    // helper to invoke our own tools in-process
    const callTool = async (name, args) => {
      const t = server.tools.get(name);
      return t.handler(args);
    };

    await new Promise((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(port, '127.0.0.1', resolve);
    });
    setTimeout(() => httpServer.close(), ttlSeconds * 1000).unref();

    return {
      ok: true,
      url: `http://127.0.0.1:${port}/premium`,
      flow: '1) GET → 402 + PAYMENT-REQUIRED  2) pay on Pharos  3) GET with PAYMENT-SIGNATURE: base64({nonce, txHash}) → 200 + PAYMENT-RESPONSE',
      network: net.name,
      autoShutdownSeconds: ttlSeconds,
    };
  }
);

server.start();
