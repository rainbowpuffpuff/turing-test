#!/usr/bin/env node
// pharos-payroll-batch — MCP server
// RealFi batch disbursement on Pharos: pay many recipients (salaries, rewards,
// agent fees, airdrops) in one efficient flow. Native PHRS batches go through
// Multicall3.aggregate3Value in a SINGLE transaction; ERC-20 batches execute
// as paced sequential transfers with a full reconciliation report.
//
// Safety: dry_run tool previews everything (validation, totals, balance check)
// without sending; run_payroll requires explicit confirm:true.
//
// Tools:
//   parse_recipients — validate a CSV/JSON recipient list into a normalized payroll
//   dry_run          — full preflight: dedupe, totals, balance/gas check, per-row validation
//   run_payroll      — execute (native: single Multicall3 tx; token: sequential)
//   payout_report    — reconcile a payroll run from on-chain receipts
import { McpServer } from './lib/mcp.mjs';
import { encodeCall, abiDecode, abiEncode, parseUnits, formatUnits, checksum, bytesToHex, concat, selector } from './lib/evm.mjs';
import { rpcFor, walletFor, txLink, getNetwork, resolveToken, MULTICALL3 } from './lib/pharos.mjs';

const VERSION = '1.0.0';

function parseList(input) {
  // Accepts: JSON array [{address, amount}, ...] OR CSV "address,amount" lines
  let rows = [];
  const trimmed = input.trim();
  if (trimmed.startsWith('[')) {
    rows = JSON.parse(trimmed).map((r) => ({ address: r.address ?? r.to ?? r.wallet, amount: String(r.amount ?? r.value) }));
  } else {
    for (const line of trimmed.split(/\r?\n/)) {
      const l = line.trim();
      if (!l || l.startsWith('#') || /^address[,;]/i.test(l)) continue;
      const [address, amount] = l.split(/[,;]\s*/);
      rows.push({ address: address?.trim(), amount: amount?.trim() });
    }
  }
  const errors = [];
  const seen = new Map();
  const valid = [];
  rows.forEach((r, i) => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(r.address ?? '')) { errors.push(`row ${i + 1}: bad address "${r.address}"`); return; }
    if (!/^[0-9]+(\.[0-9]+)?$/.test(r.amount ?? '') || Number(r.amount) <= 0) { errors.push(`row ${i + 1}: bad amount "${r.amount}"`); return; }
    const key = r.address.toLowerCase();
    if (seen.has(key)) { seen.set(key, seen.get(key) + 1); }
    else seen.set(key, 1);
    valid.push({ address: checksum(r.address), amount: r.amount });
  });
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([a, n]) => ({ address: a, occurrences: n }));
  return { valid, errors, duplicates, totalRows: rows.length };
}

const server = new McpServer({
  name: 'pharos-payroll-batch',
  version: VERSION,
  instructions: 'Batch payments on Pharos: parse recipient lists, dry-run with full validation, then execute — native PHRS in ONE Multicall3 transaction, ERC-20 sequentially. Always dry_run before run_payroll.',
});

// ---------------------------------------------------------------- parse_recipients
server.tool(
  'parse_recipients',
  'Validate and normalize a recipient list. Input: CSV lines "address,amount" or JSON [{address, amount}]. Returns valid rows, per-row errors, and duplicate warnings — no chain interaction.',
  { type: 'object', properties: { list: { type: 'string', minLength: 3 } }, required: ['list'] },
  async ({ list }) => {
    const parsed = parseList(list);
    return { ok: parsed.errors.length === 0, ...parsed };
  }
);

// ---------------------------------------------------------------- dry_run
server.tool(
  'dry_run',
  'Full payroll preflight WITHOUT sending: validates list, sums totals, checks payer balance (native or token), estimates gas/fees, reports shortfalls. asset: "native" | symbol | 0x address.',
  {
    type: 'object',
    properties: {
      list: { type: 'string', minLength: 3 },
      asset: { type: 'string', description: 'default "native"' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] },
    },
    required: ['list'],
  },
  async ({ list, asset = 'native', network }) => {
    const wallet = walletFor(network);
    const net = getNetwork(network);
    const parsed = parseList(list);
    if (parsed.valid.length === 0) return { ok: false, error: 'no valid rows', ...parsed };

    let decimals = 18, symbol = net.nativeToken, token = null;
    if (asset !== 'native') {
      const t = resolveToken(asset, network);
      token = t.address;
      if (t.decimals != null) { decimals = t.decimals; symbol = t.symbol; }
      else {
        decimals = Number(abiDecode(['uint256'], await wallet.rpc.ethCall(token, encodeCall('decimals()')))[0]);
        symbol = abiDecode(['string'], await wallet.rpc.ethCall(token, encodeCall('symbol()')))[0];
      }
    }
    const totalUnits = parsed.valid.reduce((a, r) => a + parseUnits(r.amount, decimals), 0n);
    const nativeBal = await wallet.rpc.getBalance(wallet.address);
    let assetBal = nativeBal;
    if (token) assetBal = abiDecode(['uint256'], await wallet.rpc.ethCall(token, encodeCall('balanceOf(address)', [wallet.address])))[0];

    // gas estimate: native → one multicall tx; token → per-transfer
    const gasPerTx = token ? 60000n * BigInt(parsed.valid.length) : 45000n + 35000n * BigInt(parsed.valid.length);
    const feeEstimate = gasPerTx * 2000000000n; // 2 gwei ceiling

    const enoughAsset = assetBal >= totalUnits;
    const enoughGas = token ? nativeBal >= feeEstimate : nativeBal >= totalUnits + feeEstimate;

    return {
      ok: parsed.errors.length === 0 && enoughAsset && enoughGas,
      payer: wallet.address,
      recipients: parsed.valid.length,
      rowErrors: parsed.errors,
      duplicates: parsed.duplicates,
      asset: token ?? 'native', symbol,
      totalToSend: formatUnits(totalUnits, decimals) + ' ' + symbol,
      payerAssetBalance: formatUnits(assetBal, decimals) + ' ' + symbol,
      estimatedFees: formatUnits(feeEstimate, 18) + ' ' + net.nativeToken,
      executionPlan: token ? `${parsed.valid.length} sequential ERC-20 transfers` : `1 Multicall3 aggregate3Value transaction (${parsed.valid.length} payouts)`,
      sufficient: { asset: enoughAsset, gas: enoughGas },
      shortfall: enoughAsset ? null : formatUnits(totalUnits - assetBal, decimals) + ' ' + symbol,
    };
  }
);

// ---------------------------------------------------------------- run_payroll
server.tool(
  'run_payroll',
  'EXECUTE the payroll. Requires confirm:true (run dry_run first!). Native: all payouts in ONE Multicall3 aggregate3Value tx. ERC-20: sequential transfers with per-row results. Returns tx hashes and a reconciliation summary.',
  {
    type: 'object',
    properties: {
      list: { type: 'string', minLength: 3 },
      asset: { type: 'string' },
      confirm: { type: 'boolean', description: 'must be true — explicit execution consent' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] },
    },
    required: ['list', 'confirm'],
  },
  async ({ list, asset = 'native', confirm, network }) => {
    if (confirm !== true) return { ok: false, error: 'set confirm:true after reviewing dry_run output' };
    const wallet = walletFor(network);
    const parsed = parseList(list);
    if (parsed.errors.length) return { ok: false, error: 'list has invalid rows — fix them first', rowErrors: parsed.errors };

    if (asset === 'native') {
      // Multicall3.aggregate3Value((address,bool,uint256,bytes)[])
      const totalValue = parsed.valid.reduce((a, r) => a + parseUnits(r.amount, 18), 0n);
      // hand-encode the tuple array: aggregate3Value selector = 0x174dea71
      const head = [];
      const tails = [];
      const n = parsed.valid.length;
      let tailOff = 32 * n;
      const encodedCalls = parsed.valid.map((r) => {
        // tuple(address target, bool allowFailure, uint256 value, bytes callData) — callData empty
        const amt = parseUnits(r.amount, 18);
        const inner = abiEncode(['address', 'bool', 'uint256'], [r.address, false, amt]);
        // bytes offset (4th field) points just past the 4 head words
        const bytesOffset = abiEncode(['uint256'], [128]);
        const bytesLen = abiEncode(['uint256'], [0]);
        return concat(inner, bytesOffset, bytesLen);
      });
      for (const enc of encodedCalls) {
        head.push(abiEncode(['uint256'], [tailOff]));
        tailOff += enc.length;
        tails.push(enc);
      }
      const arrayData = concat(abiEncode(['uint256'], [32]), abiEncode(['uint256'], [n]), ...head, ...tails);
      const calldata = bytesToHex(concat(selector('aggregate3Value((address,bool,uint256,bytes)[])'), arrayData));
      const { hash } = await wallet.sendTx({ to: MULTICALL3, data: calldata, value: totalValue });
      const rcpt = await wallet.rpc.waitReceipt(hash);
      return {
        ok: rcpt.status === '0x1',
        mode: 'multicall3-single-tx',
        recipients: n,
        totalSent: formatUnits(totalValue, 18) + ' ' + getNetwork(network).nativeToken,
        txHash: hash,
        gasUsed: Number(rcpt.gasUsed),
        explorer: txLink(hash, network),
      };
    }

    // ERC-20 sequential
    const t = resolveToken(asset, network);
    const token = t.address;
    const decimals = t.decimals ?? Number(abiDecode(['uint256'], await wallet.rpc.ethCall(token, encodeCall('decimals()')))[0]);
    const results = [];
    for (const r of parsed.valid) {
      try {
        const units = parseUnits(r.amount, decimals);
        const { hash } = await wallet.sendTx({ to: token, data: encodeCall('transfer(address,uint256)', [r.address, units]) });
        const rcpt = await wallet.rpc.waitReceipt(hash);
        results.push({ address: r.address, amount: r.amount, txHash: hash, ok: rcpt.status === '0x1' });
      } catch (e) {
        results.push({ address: r.address, amount: r.amount, ok: false, error: String(e?.message ?? e) });
      }
      await new Promise((res) => setTimeout(res, 1200)); // pace under RPC rate limit
    }
    const succeeded = results.filter((r) => r.ok).length;
    return { ok: succeeded === results.length, mode: 'erc20-sequential', succeeded, failed: results.length - succeeded, results };
  }
);

// ---------------------------------------------------------------- payout_report
server.tool(
  'payout_report',
  'Reconcile a payroll: given tx hash(es), report per-recipient outcomes by decoding receipts and transfer logs. Use after run_payroll for accounting.',
  {
    type: 'object',
    properties: {
      txHashes: { type: 'array', items: { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$' }, minItems: 1, maxItems: 100 },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] },
    },
    required: ['txHashes'],
  },
  async ({ txHashes, network }) => {
    const rpc = rpcFor(network);
    const report = [];
    for (const h of txHashes) {
      const rcpt = await rpc.receipt(h);
      if (!rcpt) { report.push({ txHash: h, status: 'not found' }); continue; }
      const transfers = (rcpt.logs ?? [])
        .filter((l) => l.topics?.[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef')
        .map((l) => ({ token: l.address, from: '0x' + l.topics[1].slice(26), to: '0x' + l.topics[2].slice(26), amountUnits: BigInt(l.data).toString() }));
      report.push({ txHash: h, status: rcpt.status === '0x1' ? 'success' : 'reverted', block: Number(rcpt.blockNumber), gasUsed: Number(rcpt.gasUsed), tokenTransfers: transfers, explorer: txLink(h, network) });
    }
    return { ok: true, transactions: report };
  }
);

server.start();
