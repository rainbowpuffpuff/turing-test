#!/usr/bin/env node
// pharos-chain-sentinel — MCP server
// The "eyes" of every Pharos agent: watch addresses, contracts, events, and
// balances; detect changes; produce structured observations an agent can act
// on. Stateless between calls by design — agents persist the returned cursor
// and pass it back, making the skill composable with any scheduler.
//
// Tools:
//   watch_address     — activity snapshot + diff vs a previous cursor
//   watch_events      — decoded event scan for any contract (with common ABIs built in)
//   balance_watch     — multi-address native/token balance snapshot with thresholds
//   tx_inspect        — deep-dive one transaction (status, transfers, logs, gas)
//   chain_pulse       — network health: block rate, gas, finality observations
//   decode_calldata   — best-effort 4byte decode of tx input against known ABIs
import { McpServer } from './lib/mcp.mjs';
import { encodeCall, abiDecode, formatUnits, keccak, bytesToHex, utf8, checksum } from './lib/evm.mjs';
import { rpcFor, getNetwork, txLink, addrLink, TOKENS } from './lib/pharos.mjs';

const VERSION = '1.0.0';

const TOPICS = {
  Transfer: bytesToHex(keccak(utf8('Transfer(address,address,uint256)'))),
  Approval: bytesToHex(keccak(utf8('Approval(address,address,uint256)'))),
  Deposit: bytesToHex(keccak(utf8('Deposit(address,uint256)'))),
  Withdrawal: bytesToHex(keccak(utf8('Withdrawal(address,uint256)'))),
  EscrowCreated: bytesToHex(keccak(utf8('EscrowCreated(uint256,address,address,uint256,uint40,bytes32)'))),
  StreamCreated: bytesToHex(keccak(utf8('StreamCreated(uint256,address,address,uint256,uint40,uint40)'))),
  InvoiceCreated: bytesToHex(keccak(utf8('InvoiceCreated(uint256,address,address,address,uint256,uint40,bytes32,string)'))),
  AgentRegistered: bytesToHex(keccak(utf8('AgentRegistered(address,string,string)'))),
};
const TOPIC_NAMES = Object.fromEntries(Object.entries(TOPICS).map(([k, v]) => [v, k]));

const KNOWN_SELECTORS = {
  'a9059cbb': 'transfer(address,uint256)',
  '23b872dd': 'transferFrom(address,address,uint256)',
  '095ea7b3': 'approve(address,uint256)',
  'd0e30db0': 'deposit()',
  '2e1a7d4d': 'withdraw(uint256)',
  '40c10f19': 'mint(address,uint256)',
  '42966c68': 'burn(uint256)',
  'b6b55f25': 'deposit(uint256)',
  '174dea71': 'aggregate3Value((address,bool,uint256,bytes)[])',
  '82ad56cb': 'aggregate3((address,bool,bytes)[])',
  'b61d27f6': 'execute(address,uint256,bytes)',
  '47e1da2a': 'executeBatch(address[],uint256[],bytes[])',
  '5fbfb9cf': 'createAccount(address,uint256)',
};

const server = new McpServer({
  name: 'pharos-chain-sentinel',
  version: VERSION,
  instructions: 'Monitor the Pharos chain for agents: watch addresses/events/balances with cursor-based diffs, inspect transactions, decode calldata, and check network health. Read-only — no private key needed.',
});

// ---------------------------------------------------------------- watch_address
server.tool(
  'watch_address',
  'Snapshot an address (balance, nonce, code?) and scan recent blocks for its activity (sent txs detected via nonce delta, received value via Transfer logs). Pass the previous result\'s `cursor` to get a diff since last check.',
  {
    type: 'object',
    properties: {
      address: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
      cursor: { type: 'object', description: 'previous {block, balance, nonce} to diff against' },
      scanBlocks: { type: 'integer', minimum: 10, maximum: 100000, description: 'Transfer-log lookback when no cursor (default 5000)' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] },
    },
    required: ['address'],
  },
  async ({ address, cursor, scanBlocks = 5000, network }) => {
    const rpc = rpcFor(network);
    const net = getNetwork(network);
    const [bal, nonceHex, latest, code] = await Promise.all([
      rpc.getBalance(address),
      rpc.call('eth_getTransactionCount', [address, 'latest']),
      rpc.blockNumber(),
      rpc.call('eth_getCode', [address, 'latest']),
    ]);
    const nonce = Number(nonceHex);
    const fromBlock = cursor?.block ? cursor.block + 1 : Math.max(0, latest - scanBlocks);
    const addrTopic = '0x' + address.slice(2).toLowerCase().padStart(64, '0');

    let incoming = [], outgoing = [];
    try {
      const inLogs = await rpc.getLogsChunked({ topics: [TOPICS.Transfer, null, addrTopic], fromBlock });
      incoming = inLogs.slice(-50).map((l) => ({ token: l.address, from: checksum('0x' + l.topics[1].slice(26)), amountUnits: BigInt(l.data === '0x' ? 0 : l.data).toString(), tx: l.transactionHash, block: Number(l.blockNumber) }));
    } catch {}
    try {
      const outLogs = await rpc.getLogsChunked({ topics: [TOPICS.Transfer, addrTopic], fromBlock });
      outgoing = outLogs.slice(-50).map((l) => ({ token: l.address, to: checksum('0x' + l.topics[2].slice(26)), amountUnits: BigInt(l.data === '0x' ? 0 : l.data).toString(), tx: l.transactionHash, block: Number(l.blockNumber) }));
    } catch {}

    const diff = cursor ? {
      balanceChange: formatUnits(bal - BigInt(cursor.balance ?? 0), 18) + ' ' + net.nativeToken,
      newTxsSent: nonce - (cursor.nonce ?? 0),
      tokenTransfersIn: incoming.length,
      tokenTransfersOut: outgoing.length,
      changed: bal !== BigInt(cursor.balance ?? 0) || nonce !== (cursor.nonce ?? 0) || incoming.length > 0 || outgoing.length > 0,
    } : null;

    return {
      ok: true,
      address: checksum(address),
      isContract: code !== '0x',
      balance: formatUnits(bal, 18) + ' ' + net.nativeToken,
      nonce,
      scannedFromBlock: fromBlock,
      latestBlock: latest,
      tokenTransfers: { incoming, outgoing },
      diff,
      cursor: { block: latest, balance: bal.toString(), nonce },
      explorer: addrLink(address, network),
    };
  }
);

// ---------------------------------------------------------------- watch_events
server.tool(
  'watch_events',
  'Scan a contract for events. Knows common signatures (ERC-20 Transfer/Approval, WPHRS Deposit/Withdrawal, PharosKit EscrowCreated/StreamCreated/InvoiceCreated/AgentRegistered) and labels them; unknown topics are returned raw. Custom signature supported via eventSignature.',
  {
    type: 'object',
    properties: {
      contract: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
      eventSignature: { type: 'string', description: 'e.g. "Transfer(address,address,uint256)" — filters to this event' },
      fromBlock: { type: 'integer', minimum: 0, description: 'default latest-5000' },
      toBlock: { type: 'integer', minimum: 0, description: 'default latest' },
      maxResults: { type: 'integer', minimum: 1, maximum: 200, description: 'default 50' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] },
    },
    required: ['contract'],
  },
  async ({ contract, eventSignature, fromBlock, toBlock, maxResults = 50, network }) => {
    const rpc = rpcFor(network);
    const latest = await rpc.blockNumber();
    const from = fromBlock ?? Math.max(0, latest - 5000);
    const to = toBlock ?? latest;
    const topics = eventSignature ? [bytesToHex(keccak(utf8(eventSignature)))] : [];
    const logs = await rpc.getLogsChunked({ address: contract, topics, fromBlock: from, toBlock: to });
    const events = logs.slice(-maxResults).map((l) => ({
      event: TOPIC_NAMES[l.topics?.[0]] ?? (eventSignature ? eventSignature.split('(')[0] : 'unknown'),
      topic0: l.topics?.[0],
      indexed: (l.topics ?? []).slice(1),
      data: l.data,
      tx: l.transactionHash,
      block: Number(l.blockNumber),
      explorer: txLink(l.transactionHash, network),
    }));
    return { ok: true, contract: checksum(contract), scanned: { fromBlock: from, toBlock: to }, found: logs.length, returned: events.length, events, cursor: { block: to } };
  }
);

// ---------------------------------------------------------------- balance_watch
server.tool(
  'balance_watch',
  'Snapshot native + token balances for up to 10 addresses, with optional low/high thresholds that produce alerts. Token list defaults to the canonical registry (USDC, USDT, WPHRS, ...).',
  {
    type: 'object',
    properties: {
      addresses: { type: 'array', items: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' }, minItems: 1, maxItems: 10 },
      tokens: { type: 'array', items: { type: 'string' }, description: 'symbols or 0x addresses; default = canonical registry' },
      minNative: { type: 'string', pattern: '^[0-9]+(\\.[0-9]+)?$', description: 'alert if native balance below this' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] },
    },
    required: ['addresses'],
  },
  async ({ addresses, tokens, minNative, network }) => {
    const rpc = rpcFor(network);
    const net = getNetwork(network);
    const registry = TOKENS[net.name] ?? {};
    const tokenList = (tokens ?? Object.keys(registry)).map((t) => /^0x/.test(t) ? { symbol: t.slice(0, 8), address: t, decimals: null } : registry[t.toUpperCase()]).filter(Boolean);

    const results = [];
    const alerts = [];
    for (const a of addresses) {
      const nat = await rpc.getBalance(a);
      const row = { address: checksum(a), native: formatUnits(nat, 18) + ' ' + net.nativeToken, tokens: {} };
      if (minNative && nat < BigInt(Math.round(Number(minNative) * 1e6)) * 10n ** 12n) {
        alerts.push({ address: checksum(a), alert: 'native_below_min', balance: row.native, threshold: minNative });
      }
      for (const t of tokenList) {
        try {
          const raw = await rpc.ethCall(t.address, encodeCall('balanceOf(address)', [a]));
          const dec = t.decimals ?? Number(abiDecode(['uint256'], await rpc.ethCall(t.address, encodeCall('decimals()')))[0]);
          const b = abiDecode(['uint256'], raw)[0];
          if (b > 0n) row.tokens[t.symbol] = formatUnits(b, dec);
        } catch {}
      }
      results.push(row);
      await new Promise((r) => setTimeout(r, 300)); // pace RPC
    }
    return { ok: true, network: net.name, balances: results, alerts, checkedAt: new Date().toISOString() };
  }
);

// ---------------------------------------------------------------- tx_inspect
server.tool(
  'tx_inspect',
  'Deep-inspect a transaction: status, from/to, value, gas economics (Pharos charges gas_limit!), decoded function selector, token transfers, and event count.',
  {
    type: 'object',
    properties: {
      txHash: { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] },
    },
    required: ['txHash'],
  },
  async ({ txHash, network }) => {
    const rpc = rpcFor(network);
    const net = getNetwork(network);
    const [tx, rcpt] = await Promise.all([
      rpc.call('eth_getTransactionByHash', [txHash]),
      rpc.receipt(txHash),
    ]);
    if (!tx) return { ok: false, error: 'transaction not found' };
    const sel = (tx.input ?? '0x').slice(2, 10);
    const transfers = (rcpt?.logs ?? [])
      .filter((l) => l.topics?.[0] === TOPICS.Transfer)
      .map((l) => ({ token: l.address, from: checksum('0x' + l.topics[1].slice(26)), to: checksum('0x' + l.topics[2].slice(26)), amountUnits: BigInt(l.data === '0x' ? 0 : l.data).toString() }));
    return {
      ok: true,
      txHash,
      status: rcpt ? (rcpt.status === '0x1' ? 'success' : 'reverted') : 'pending',
      from: checksum(tx.from),
      to: tx.to ? checksum(tx.to) : null,
      contractCreated: rcpt?.contractAddress ?? null,
      value: formatUnits(BigInt(tx.value), 18) + ' ' + net.nativeToken,
      function: tx.input === '0x' ? 'native transfer' : (KNOWN_SELECTORS[sel] ?? `unknown selector 0x${sel}`),
      gas: rcpt ? {
        gasLimit: Number(BigInt(tx.gas)),
        gasUsed: Number(BigInt(rcpt.gasUsed)),
        note: 'Pharos charges gas_limit at inclusion (not gas_used) — size limits carefully',
        effectiveGasPrice: rcpt.effectiveGasPrice ? formatUnits(BigInt(rcpt.effectiveGasPrice), 9) + ' gwei' : null,
      } : null,
      tokenTransfers: transfers,
      eventCount: rcpt?.logs?.length ?? 0,
      block: rcpt ? Number(rcpt.blockNumber) : null,
      explorer: txLink(txHash, network),
    };
  }
);

// ---------------------------------------------------------------- chain_pulse
server.tool(
  'chain_pulse',
  'Network health snapshot: latest block, observed block interval, base fee, gas price, and chain id sanity check. Use before batches of transactions.',
  { type: 'object', properties: { network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] } } },
  async ({ network }) => {
    const rpc = rpcFor(network);
    const net = getNetwork(network);
    const latest = await rpc.call('eth_getBlockByNumber', ['latest', false]);
    const prevNum = '0x' + (Number(latest.number) - 10).toString(16);
    const prev = await rpc.call('eth_getBlockByNumber', [prevNum, false]);
    const dt = Number(latest.timestamp) - Number(prev.timestamp);
    const [gasPrice, chainId] = await Promise.all([rpc.gasPrice(), rpc.chainId()]);
    return {
      ok: true,
      network: net.name,
      chainId,
      chainIdMatches: chainId === net.chainId,
      latestBlock: Number(latest.number),
      blockTimeSeconds: Number((dt / 10).toFixed(2)),
      baseFee: latest.baseFeePerGas ? formatUnits(BigInt(latest.baseFeePerGas), 9) + ' gwei' : null,
      gasPrice: formatUnits(gasPrice, 9) + ' gwei',
      txsInLatestBlock: latest.transactions?.length ?? 0,
      observedAt: new Date().toISOString(),
    };
  }
);

// ---------------------------------------------------------------- decode_calldata
server.tool(
  'decode_calldata',
  'Best-effort decode of transaction calldata: identifies the function from a built-in selector table (ERC-20, WPHRS, Multicall3, ERC-4337 SimpleAccount, PharosKit) and decodes arguments for the common cases.',
  {
    type: 'object',
    properties: { calldata: { type: 'string', pattern: '^0x[0-9a-fA-F]*$' } },
    required: ['calldata'],
  },
  async ({ calldata }) => {
    if (calldata === '0x' || calldata.length < 10) return { ok: true, type: 'native transfer or empty', selector: null };
    const sel = calldata.slice(2, 10);
    const sig = KNOWN_SELECTORS[sel];
    if (!sig) return { ok: true, selector: '0x' + sel, function: 'unknown', note: 'selector not in built-in table' };
    const argsHex = '0x' + calldata.slice(10);
    let args = null;
    try {
      if (sig === 'transfer(address,uint256)' || sig === 'approve(address,uint256)' || sig === 'mint(address,uint256)') {
        const [a, v] = abiDecode(['address', 'uint256'], argsHex);
        args = { address: a, amountUnits: v.toString() };
      } else if (sig === 'transferFrom(address,address,uint256)') {
        const [f, t, v] = abiDecode(['address', 'address', 'uint256'], argsHex);
        args = { from: f, to: t, amountUnits: v.toString() };
      } else if (sig === 'withdraw(uint256)' || sig === 'burn(uint256)' || sig === 'deposit(uint256)') {
        args = { amountUnits: abiDecode(['uint256'], argsHex)[0].toString() };
      } else if (sig === 'execute(address,uint256,bytes)') {
        const [d, v, b] = abiDecode(['address', 'uint256', 'bytes'], argsHex);
        args = { dest: d, valueWei: v.toString(), innerCalldata: b };
      } else if (sig === 'createAccount(address,uint256)') {
        const [o, s] = abiDecode(['address', 'uint256'], argsHex);
        args = { owner: o, salt: s.toString() };
      }
    } catch {}
    return { ok: true, selector: '0x' + sel, function: sig, args };
  }
);

server.start();
