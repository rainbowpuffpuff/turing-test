---
name: pharos-chain-sentinel
description: >
  The eyes of every Pharos agent: watch addresses, decode events, monitor balances — with diff cursors. Invoke this skill whenever the user or agent mentions: monitor address, watch wallet, track transactions, decode event, balance alert, chain health, inspect tx, watch contract.
  Read-only chain monitoring built for agent loops: snapshot any address and diff against a cursor from the previous check (balance deltas, new txs, token flows), scan contracts for events with built-in decoding of common signatures (ERC-20, WPHRS, ERC-4337, and the PharosKit contracts), multi-address balance watch with threshold alerts, deep transaction inspection (including Pharos's charge-gas_limit quirk), network health pulse, and calldata decoding. No private key required.. Works on Pharos Atlantic testnet (chainId 688689)
  and Pacific mainnet (chainId 1672). Read-only: no private key required.
version: 1.0.0
requires:
  node: ">=18"
network:
  default: atlantic-testnet
  chainId: 688689
  nativeToken: PHRS
tags: [pharos, agent-skill, mcp, agent-infrastructure]
license: MIT
---

# Pharos Chain Sentinel

Read-only chain monitoring built for agent loops: snapshot any address and diff against a cursor from the previous check (balance deltas, new txs, token flows), scan contracts for events with built-in decoding of common signatures (ERC-20, WPHRS, ERC-4337, and the PharosKit contracts), multi-address balance watch with threshold alerts, deep transaction inspection (including Pharos's charge-gas_limit quirk), network health pulse, and calldata decoding. No private key required.

## Quick Start

```bash
# Run as an MCP server (stdio transport) — zero dependencies, Node 18+
node src/server.mjs
```

Register in any MCP-capable agent (Claude Desktop, Cursor, custom agents):

```json
{
  "mcpServers": {
    "pharos-chain-sentinel": {
      "command": "node",
      "args": ["pharos-chain-sentinel/src/server.mjs"]
    }
  }
}
```

## Capability Index

| Tool | What it does |
|------|--------------|
| `watch_address` | Snapshot an address (balance, nonce, code?) and scan recent blocks for its activity (sent txs detected via nonce delta, received value via Transfer logs). |
| `watch_events` | Scan a contract for events. |
| `balance_watch` | Snapshot native + token balances for up to 10 addresses, with optional low/high thresholds that produce alerts. |
| `tx_inspect` | Deep-inspect a transaction: status, from/to, value, gas economics (Pharos charges gas_limit!), decoded function selector, token transfers, and event count. |
| `chain_pulse` | Network health snapshot: latest block, observed block interval, base fee, gas price, and chain id sanity check. |
| `decode_calldata` | Best-effort decode of transaction calldata: identifies the function from a built-in selector table (ERC-20, WPHRS, Multicall3, ERC-4337 SimpleAccount, PharosKit) and decodes arguments for the common cases. |

Full parameter schemas: `references/tools.md` (auto-generated from the live server).

## Network Configuration

Defaults to **Atlantic testnet** (chainId 688689). Pass `network: "mainnet"` per call for Pacific mainnet (chainId 1672). Endpoints and explorers ship in `assets/networks.json`:

| Network | RPC | ChainId | Explorer |
|---------|-----|---------|----------|
| atlantic-testnet | https://atlantic.dplabs-internal.com | 688689 | https://atlantic.pharosscan.xyz |
| mainnet | https://rpc.pharos.xyz | 1672 | https://www.pharosscan.xyz |

Override the RPC with `PHAROS_RPC_URL` if you have a dedicated endpoint.

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| _none_ | — | this skill is read-only |
| `PHAROS_RPC_URL` | no | override the default RPC endpoint |
| `PHAROS_NETWORK` | no | default network (`atlantic-testnet` / `mainnet`) |

## Security Notes

- **Zero runtime dependencies** — no npm install, no supply-chain surface. Crypto primitives are vendored builds of audited `@noble/secp256k1` + `@noble/hashes` (in `src/lib/vendor/`, fetched from esm.sh, pinned).
- No shell execution, no filesystem writes (outside explicit user-invoked flows), no telemetry, no external endpoints besides the configured Pharos RPC.
- Private keys sign transactions **locally** (own RLP/EIP-1559 implementation, verified against known-answer test vectors); raw keys never leave the process.
- Pharos gas quirk handled: the chain charges `gas_limit` (not `gas_used`) at inclusion — estimates use a modest +15% buffer and 0 priority fee.

## Composability

Designed as part of the **PharosKit** suite — pairs naturally with `all PharosKit skills — provides the observation layer`. Each PharosKit skill is independent (this repo is self-contained) but they share conventions: same network config, same error shape (`{ok, error?}`), same explorer-link outputs — so agents can chain them without glue code.

## Live On-Chain Proof (Atlantic testnet)

- `tx_inspect(escrow release)` → [`0xdedd5d10d833fe5a…`](https://atlantic.pharosscan.xyz/tx/0xdedd5d10d833fe5ac8a70c03b6d66841f5427e62bca0320cba9632e2dec1b688)

## File Tree

```
pharos-chain-sentinel/
├── SKILL.md                 # this manifest (Anvita Flow / pharos-skill-engine format)
├── src/
│   ├── server.mjs           # MCP server (stdio) — all tools
│   └── lib/                 # zero-dependency runtime (EVM codec, signer, MCP, Pharos nets)
├── assets/
│   ├── networks.json        # canonical network config
│   └── tokens.json           # canonical token registry
├── references/
│   └── tools.md             # full per-tool parameter schemas
├── test/
│   └── smoke.mjs            # protocol + tool smoke test
└── README.md
```
