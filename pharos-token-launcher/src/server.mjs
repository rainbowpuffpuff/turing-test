#!/usr/bin/env node
// pharos-token-launcher — MCP server
// Agents issue their own on-chain economies on Pharos: deploy an auditable
// ERC-20 (AgentToken: cap, mint/burn, EIP-2612 permit, renounceable minting),
// manage supply, distribute, and wrap/unwrap native PHRS ↔ WPHRS.
//
// The AgentToken bytecode is compiled-in (solc 0.8.26, optimized) and the
// Solidity source ships in contracts/AgentToken.sol for verification.
//
// Tools:
//   deploy_token    — deploy a new AgentToken (name, symbol, decimals, cap, initial mint)
//   token_info      — supply, cap, owner, balances
//   mint_tokens     — owner mints (respects cap)
//   burn_tokens     — burn own tokens
//   transfer_tokens — send tokens
//   renounce_minting — permanently fix supply
//   wrap_native     — PHRS → WPHRS (deposit)
//   unwrap_native   — WPHRS → PHRS (withdraw)
import { McpServer } from './lib/mcp.mjs';
import { encodeCall, abiDecode, abiEncode, parseUnits, formatUnits, bytesToHex, concat, hexToBytes, checksum } from './lib/evm.mjs';
import { rpcFor, walletFor, txLink, addrLink, getNetwork, TOKENS } from './lib/pharos.mjs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const VERSION = '1.0.0';
const __dir = dirname(fileURLToPath(import.meta.url));

function tokenBytecode() {
  const j = JSON.parse(readFileSync(join(__dir, '..', 'assets', 'agenttoken.json'), 'utf8'));
  const key = Object.keys(j.contracts).find((k) => k.endsWith(':AgentToken'));
  return '0x' + j.contracts[key].bin;
}

async function sendAndReport(wallet, to, data, value = 0n, network) {
  const { hash } = await wallet.sendTx({ to, data, value });
  const rcpt = await wallet.rpc.waitReceipt(hash);
  return { ok: rcpt.status === '0x1', txHash: hash, gasUsed: Number(rcpt.gasUsed), explorer: txLink(hash, network), receipt: rcpt };
}

const server = new McpServer({
  name: 'pharos-token-launcher',
  version: VERSION,
  instructions: 'Launch and manage agent-issued ERC-20 tokens on Pharos (cap, mint, burn, EIP-2612 permit), plus wrap/unwrap native PHRS ↔ WPHRS. Write ops need PHAROS_PRIVATE_KEY.',
});

// ---------------------------------------------------------------- deploy_token
server.tool(
  'deploy_token',
  'Deploy a new AgentToken ERC-20. cap=0 means uncapped. initialMint goes to the owner (your wallet). Source: contracts/AgentToken.sol (MIT, EIP-2612 permit included).',
  {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 64 },
      symbol: { type: 'string', minLength: 1, maxLength: 16 },
      decimals: { type: 'integer', minimum: 0, maximum: 18, description: 'default 18' },
      cap: { type: 'string', pattern: '^[0-9]+(\\.[0-9]+)?$', description: 'max supply in human units; "0" = uncapped' },
      initialMint: { type: 'string', pattern: '^[0-9]+(\\.[0-9]+)?$', description: 'minted to you at deploy (default "0")' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet', 'mantle-sepolia', 'mantle'] },
    },
    required: ['name', 'symbol'],
  },
  async ({ name, symbol, decimals = 18, cap = '0', initialMint = '0', network }) => {
    const wallet = walletFor(network);
    const capU = parseUnits(cap, decimals);
    const mintU = parseUnits(initialMint, decimals);
    const ctorArgs = abiEncode(['string', 'string', 'uint8', 'uint256', 'uint256', 'address'], [name, symbol, decimals, capU, mintU, wallet.address]);
    const data = bytesToHex(concat(hexToBytes(tokenBytecode()), ctorArgs));
    const { hash } = await wallet.sendTx({ to: null, data });
    const rcpt = await wallet.rpc.waitReceipt(hash);
    if (rcpt.status !== '0x1') return { ok: false, error: 'deployment reverted', txHash: hash };
    return {
      ok: true,
      token: checksum(rcpt.contractAddress),
      name, symbol, decimals,
      cap: cap === '0' ? 'uncapped' : cap,
      initialMint,
      owner: wallet.address,
      txHash: hash,
      gasUsed: Number(rcpt.gasUsed),
      explorer: addrLink(rcpt.contractAddress, network),
      deployTx: txLink(hash, network),
    };
  }
);

// ---------------------------------------------------------------- token_info
server.tool(
  'token_info',
  'Read any ERC-20: name, symbol, decimals, totalSupply, plus AgentToken extras (cap, owner, mintingRenounced) when available. Optionally check balances for given addresses.',
  {
    type: 'object',
    properties: {
      token: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
      balancesOf: { type: 'array', items: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' }, maxItems: 10 },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet', 'mantle-sepolia', 'mantle'] },
    },
    required: ['token'],
  },
  async ({ token, balancesOf = [], network }) => {
    const rpc = rpcFor(network);
    const read = async (sig, types) => {
      try { return abiDecode(types, await rpc.ethCall(token, encodeCall(sig)))[0]; } catch { return null; }
    };
    const [name, symbol, decimals, totalSupply, cap, owner, renounced] = [
      await read('name()', ['string']),
      await read('symbol()', ['string']),
      await read('decimals()', ['uint256']),
      await read('totalSupply()', ['uint256']),
      await read('cap()', ['uint256']),
      await read('owner()', ['address']),
      await read('mintingRenounced()', ['bool']),
    ];
    if (symbol == null) return { ok: false, error: 'not an ERC-20 (symbol() failed)' };
    const dec = Number(decimals ?? 18n);
    const balances = [];
    for (const a of balancesOf) {
      const b = abiDecode(['uint256'], await rpc.ethCall(token, encodeCall('balanceOf(address)', [a])))[0];
      balances.push({ address: checksum(a), balance: formatUnits(b, dec) });
    }
    return {
      ok: true, token: checksum(token), name, symbol, decimals: dec,
      totalSupply: totalSupply != null ? formatUnits(totalSupply, dec) : null,
      cap: cap != null ? (cap === 0n ? 'uncapped' : formatUnits(cap, dec)) : null,
      owner, mintingRenounced: renounced,
      balances,
      explorer: addrLink(token, network),
    };
  }
);

// ---------------------------------------------------------------- mint_tokens
server.tool(
  'mint_tokens',
  'Mint new supply of an AgentToken you own, to any recipient (cap-respecting).',
  {
    type: 'object',
    properties: {
      token: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
      to: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
      amount: { type: 'string', pattern: '^[0-9]+(\\.[0-9]+)?$' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet', 'mantle-sepolia', 'mantle'] },
    },
    required: ['token', 'to', 'amount'],
  },
  async ({ token, to, amount, network }) => {
    const wallet = walletFor(network);
    const dec = Number(abiDecode(['uint256'], await wallet.rpc.ethCall(token, encodeCall('decimals()')))[0]);
    const res = await sendAndReport(wallet, token, encodeCall('mint(address,uint256)', [to, parseUnits(amount, dec)]), 0n, network);
    return res.ok ? { ok: true, minted: amount, to: checksum(to), txHash: res.txHash, explorer: res.explorer } : { ok: false, error: 'mint reverted (not owner? cap? renounced?)', ...res };
  }
);

// ---------------------------------------------------------------- burn_tokens
server.tool(
  'burn_tokens',
  'Burn your own AgentToken balance (reduces totalSupply).',
  {
    type: 'object',
    properties: {
      token: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
      amount: { type: 'string', pattern: '^[0-9]+(\\.[0-9]+)?$' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet', 'mantle-sepolia', 'mantle'] },
    },
    required: ['token', 'amount'],
  },
  async ({ token, amount, network }) => {
    const wallet = walletFor(network);
    const dec = Number(abiDecode(['uint256'], await wallet.rpc.ethCall(token, encodeCall('decimals()')))[0]);
    const res = await sendAndReport(wallet, token, encodeCall('burn(uint256)', [parseUnits(amount, dec)]), 0n, network);
    return res.ok ? { ok: true, burned: amount, txHash: res.txHash, explorer: res.explorer } : { ok: false, error: 'burn reverted (insufficient balance?)', ...res };
  }
);

// ---------------------------------------------------------------- transfer_tokens
server.tool(
  'transfer_tokens',
  'Transfer any ERC-20 (AgentToken, USDC, WPHRS, ...) by address or known symbol.',
  {
    type: 'object',
    properties: {
      token: { type: 'string', description: '0x address or symbol (USDC, WPHRS, ...)' },
      to: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
      amount: { type: 'string', pattern: '^[0-9]+(\\.[0-9]+)?$' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet', 'mantle-sepolia', 'mantle'] },
    },
    required: ['token', 'to', 'amount'],
  },
  async ({ token, to, amount, network }) => {
    const wallet = walletFor(network);
    const net = getNetwork(network);
    let addr = token;
    if (!/^0x/.test(token)) {
      const t = TOKENS[net.name]?.[token.toUpperCase()];
      if (!t) return { ok: false, error: `unknown symbol ${token}` };
      addr = t.address;
    }
    const dec = Number(abiDecode(['uint256'], await wallet.rpc.ethCall(addr, encodeCall('decimals()')))[0]);
    const res = await sendAndReport(wallet, addr, encodeCall('transfer(address,uint256)', [to, parseUnits(amount, dec)]), 0n, network);
    return res.ok ? { ok: true, sent: amount, to: checksum(to), token: checksum(addr), txHash: res.txHash, explorer: res.explorer } : { ok: false, error: 'transfer reverted', ...res };
  }
);

// ---------------------------------------------------------------- renounce_minting
server.tool(
  'renounce_minting',
  'PERMANENTLY disable minting on an AgentToken you own — fixes supply forever. Irreversible; requires confirm:true.',
  {
    type: 'object',
    properties: {
      token: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
      confirm: { type: 'boolean' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet', 'mantle-sepolia', 'mantle'] },
    },
    required: ['token', 'confirm'],
  },
  async ({ token, confirm, network }) => {
    if (confirm !== true) return { ok: false, error: 'irreversible — set confirm:true to proceed' };
    const wallet = walletFor(network);
    const res = await sendAndReport(wallet, token, encodeCall('renounceMinting()'), 0n, network);
    return res.ok ? { ok: true, token: checksum(token), supplyFixed: true, txHash: res.txHash, explorer: res.explorer } : { ok: false, error: 'renounce reverted (not owner?)', ...res };
  }
);

// ---------------------------------------------------------------- wrap_native
server.tool(
  'wrap_native',
  'Wrap native PHRS into WPHRS (canonical wrapped token) via deposit(). Makes native value ERC-20-composable.',
  {
    type: 'object',
    properties: {
      amount: { type: 'string', pattern: '^[0-9]+(\\.[0-9]+)?$' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet', 'mantle-sepolia', 'mantle'] },
    },
    required: ['amount'],
  },
  async ({ amount, network }) => {
    const wallet = walletFor(network);
    const net = getNetwork(network);
    const w = TOKENS[net.name]?.WPHRS ?? TOKENS[net.name]?.WPROS ?? TOKENS[net.name]?.WMNT;
    if (!w) return { ok: false, error: 'no wrapped-native token known on this network' };
    const res = await sendAndReport(wallet, w.address, encodeCall('deposit()'), parseUnits(amount, 18), network);
    return res.ok ? { ok: true, wrapped: `${amount} ${net.nativeToken} → ${w.symbol}`, txHash: res.txHash, explorer: res.explorer } : { ok: false, error: 'deposit reverted', ...res };
  }
);

// ---------------------------------------------------------------- unwrap_native
server.tool(
  'unwrap_native',
  'Unwrap WPHRS back to native PHRS via withdraw(amount).',
  {
    type: 'object',
    properties: {
      amount: { type: 'string', pattern: '^[0-9]+(\\.[0-9]+)?$' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet', 'mantle-sepolia', 'mantle'] },
    },
    required: ['amount'],
  },
  async ({ amount, network }) => {
    const wallet = walletFor(network);
    const net = getNetwork(network);
    const w = TOKENS[net.name]?.WPHRS ?? TOKENS[net.name]?.WPROS ?? TOKENS[net.name]?.WMNT;
    if (!w) return { ok: false, error: 'no wrapped-native token known on this network' };
    const res = await sendAndReport(wallet, w.address, encodeCall('withdraw(uint256)', [parseUnits(amount, 18)]), 0n, network);
    return res.ok ? { ok: true, unwrapped: `${amount} ${w.symbol} → ${net.nativeToken}`, txHash: res.txHash, explorer: res.explorer } : { ok: false, error: 'withdraw reverted (balance?)', ...res };
  }
);

server.start();
