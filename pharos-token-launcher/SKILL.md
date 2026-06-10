---
name: pharos-token-launcher
description: >
  Agents launch their own on-chain economies: deploy capped ERC-20s with permit, mint, burn. Invoke this skill whenever the user or agent mentions: deploy token, create token, launch ERC-20, mint, burn, token supply, wrap PHRS, WPHRS, token economy.
  Deploy an auditable AgentToken ERC-20 (compiled-in bytecode, source included): optional hard cap, owner minting that can be renounced forever, burn, and EIP-2612 permit for gasless approvals. Plus utilities every token economy needs: rich token_info for ANY ERC-20, transfers by symbol or address, and native PHRS ↔ WPHRS wrap/unwrap. Works on Pharos Atlantic testnet (chainId 688689)
  and Pacific mainnet (chainId 1672). Write operations sign locally with PHAROS_PRIVATE_KEY.
version: 1.0.0
requires:
  node: ">=18"
network:
  default: atlantic-testnet
  chainId: 688689
  nativeToken: PHRS
tags: [pharos, agent-skill, mcp, token-infrastructure]
license: MIT
---

# Pharos Token Launcher

Deploy an auditable AgentToken ERC-20 (compiled-in bytecode, source included): optional hard cap, owner minting that can be renounced forever, burn, and EIP-2612 permit for gasless approvals. Plus utilities every token economy needs: rich token_info for ANY ERC-20, transfers by symbol or address, and native PHRS ↔ WPHRS wrap/unwrap. Lets agents issue reward points, loyalty tokens, or project currencies in one call.

## Quick Start

```bash
# Run as an MCP server (stdio transport) — zero dependencies, Node 18+
node src/server.mjs
```

Register in any MCP-capable agent (Claude Desktop, Cursor, custom agents):

```json
{
  "mcpServers": {
    "pharos-token-launcher": {
      "command": "node",
      "args": ["pharos-token-launcher/src/server.mjs"],
      "env": { "PHAROS_PRIVATE_KEY": "<funded testnet key>" }
    }
  }
}
```

## Capability Index

| Tool | What it does |
|------|--------------|
| `deploy_token` | Deploy a new AgentToken ERC-20. |
| `token_info` | Read any ERC-20: name, symbol, decimals, totalSupply, plus AgentToken extras (cap, owner, mintingRenounced) when available. |
| `mint_tokens` | Mint new supply of an AgentToken you own, to any recipient (cap-respecting). |
| `burn_tokens` | Burn your own AgentToken balance (reduces totalSupply). |
| `transfer_tokens` | Transfer any ERC-20 (AgentToken, USDC, WPHRS, . |
| `renounce_minting` | PERMANENTLY disable minting on an AgentToken you own — fixes supply forever. |
| `wrap_native` | Wrap native PHRS into WPHRS (canonical wrapped token) via deposit(). |
| `unwrap_native` | Unwrap WPHRS back to native PHRS via withdraw(amount). |

Full parameter schemas: `references/tools.md` (auto-generated from the live server).

## Network Configuration

Defaults to **Atlantic testnet** (chainId 688689). Pass `network: "mainnet"` per call for Pacific mainnet (chainId 1672). Endpoints and explorers ship in `assets/networks.json`:

| Network | RPC | ChainId | Explorer |
|---------|-----|---------|----------|
| atlantic-testnet | https://atlantic.dplabs-internal.com | 688689 | https://atlantic.pharosscan.xyz |
| mainnet | https://rpc.pharos.xyz | 1672 | https://www.pharosscan.xyz |

Override the RPC with `PHAROS_RPC_URL` if you have a dedicated endpoint.

## On-Chain Contract

This skill uses: **AgentToken (original, bytecode ships with skill; deployed per-use)**.

Solidity source ships in `contracts/` — original, dependency-free, MIT-licensed. Deployment addresses live in `assets/deployments.json` and can be overridden via environment variable (see `references/tools.md`).
## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `PHAROS_PRIVATE_KEY` | for write ops | signs transactions locally; never logged or transmitted |
| `PHAROS_RPC_URL` | no | override the default RPC endpoint |
| `PHAROS_NETWORK` | no | default network (`atlantic-testnet` / `mainnet`) |

## Security Notes

- **Zero runtime dependencies** — no npm install, no supply-chain surface. Crypto primitives are vendored builds of audited `@noble/secp256k1` + `@noble/hashes` (in `src/lib/vendor/`, fetched from esm.sh, pinned).
- No shell execution, no filesystem writes (outside explicit user-invoked flows), no telemetry, no external endpoints besides the configured Pharos RPC.
- Private keys sign transactions **locally** (own RLP/EIP-1559 implementation, verified against known-answer test vectors); raw keys never leave the process.
- Pharos gas quirk handled: the chain charges `gas_limit` (not `gas_used`) at inclusion — estimates use a modest +15% buffer and 0 priority fee.
- Destructive/spending operations require explicit parameters (`confirm: true` flags, hard `maxPayment` caps) — the agent cannot overspend by accident.

## Composability

Designed as part of the **PharosKit** suite — pairs naturally with `pharos-payroll-batch`, `pharos-smart-account`, `pharos-invoice-book`. Each PharosKit skill is independent (this repo is self-contained) but they share conventions: same network config, same error shape (`{ok, error?}`), same explorer-link outputs — so agents can chain them without glue code.

## Live On-Chain Proof (Atlantic testnet)

- `deploy_token` → [`0xc9367cb8718bbaee…`](https://atlantic.pharosscan.xyz/tx/0xc9367cb8718bbaeea82a376d4e4e67ec0b3cd0db5c1725792f7d6f64084ac436)
- `mint_tokens` → [`0xf95f3111bb432c3c…`](https://atlantic.pharosscan.xyz/tx/0xf95f3111bb432c3c6096e56849d450c42fdc1785f161ad934423e71d09864379)

## File Tree

```
pharos-token-launcher/
├── SKILL.md                 # this manifest (Anvita Flow / pharos-skill-engine format)
├── src/
│   ├── server.mjs           # MCP server (stdio) — all tools
│   └── lib/                 # zero-dependency runtime (EVM codec, signer, MCP, Pharos nets)
├── assets/
│   ├── networks.json        # canonical network config
│   └── deployments.json      # deployed contract addresses
├── references/
│   └── tools.md             # full per-tool parameter schemas
├── test/
│   └── smoke.mjs            # protocol + tool smoke test
└── README.md
```
