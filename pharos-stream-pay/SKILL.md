---
name: pharos-stream-pay
description: >
  Per-second payment streams: pay an agent continuously while it works. Invoke this skill whenever the user or agent mentions: payment stream, streaming money, per-second pay, salary stream, continuous payment, vesting, pay while working.
  An original StreamPay contract on Pharos Atlantic testnet vests native PHRS linearly from payer to recipient. The recipient (e.g. Works on Pharos Atlantic testnet (chainId 688689)
  and Pacific mainnet (chainId 1672). Write operations sign locally with PHAROS_PRIVATE_KEY.
version: 1.0.0
requires:
  node: ">=18"
network:
  default: atlantic-testnet
  chainId: 688689
  nativeToken: PHRS
tags: [pharos, agent-skill, mcp, agent-payments]
license: MIT
---

# Pharos Stream Pay

An original StreamPay contract on Pharos Atlantic testnet vests native PHRS linearly from payer to recipient. The recipient (e.g. a working agent) withdraws vested funds at any moment; the payer can top-up (extending the stream at the same rate) or cancel with fair to-the-second settlement. Built for continuous agent compensation — retainers, compute rental, long-running jobs.

## Quick Start

```bash
# Run as an MCP server (stdio transport) — zero dependencies, Node 18+
node src/server.mjs
```

Register in any MCP-capable agent (Claude Desktop, Cursor, custom agents):

```json
{
  "mcpServers": {
    "pharos-stream-pay": {
      "command": "node",
      "args": ["pharos-stream-pay/src/server.mjs"],
      "env": { "PHAROS_PRIVATE_KEY": "<funded testnet key>" }
    }
  }
}
```

## Capability Index

| Tool | What it does |
|------|--------------|
| `quote_stream` | Plan a stream before opening: given total amount and duration, returns the per-second/minute/hour rate and end time. |
| `open_stream` | Open a payment stream: lock `amount` (human units of native PHRS) vesting linearly to `recipient` over `durationMinutes`, starting now. |
| `stream_status` | Live status of a stream: vested so far, withdrawable now, withdrawn, remaining, progress %. |
| `withdraw_vested` | As the stream recipient, withdraw everything vested so far. |
| `top_up` | As the payer, add funds to a live stream — extends its end time at the same vesting rate. |
| `cancel_stream` | Cancel a stream (payer or recipient). |

Full parameter schemas: `references/tools.md` (auto-generated from the live server).

## Network Configuration

Defaults to **Atlantic testnet** (chainId 688689). Pass `network: "mainnet"` per call for Pacific mainnet (chainId 1672). Endpoints and explorers ship in `assets/networks.json`:

| Network | RPC | ChainId | Explorer |
|---------|-----|---------|----------|
| atlantic-testnet | https://atlantic.dplabs-internal.com | 688689 | https://atlantic.pharosscan.xyz |
| mainnet | https://rpc.pharos.xyz | 1672 | https://www.pharosscan.xyz |

Override the RPC with `PHAROS_RPC_URL` if you have a dedicated endpoint.

## On-Chain Contract

This skill uses: **StreamPay 0xb6c2312de42b48c934ab532ccbcb80ab38a71c49 (original, deployed on Atlantic testnet)**.

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

Designed as part of the **PharosKit** suite — pairs naturally with `pharos-agent-escrow`, `pharos-chain-sentinel`, `pharos-payroll-batch`. Each PharosKit skill is independent (this repo is self-contained) but they share conventions: same network config, same error shape (`{ok, error?}`), same explorer-link outputs — so agents can chain them without glue code.

## Live On-Chain Proof (Atlantic testnet)

- `open_stream` → [`0x17a0c812b1891621…`](https://atlantic.pharosscan.xyz/tx/0x17a0c812b18916216481e7a76ce2b260ae6b5151cca903bd7a0fc4d0c3255793)
- `withdraw_vested` → [`0xa8aa3ac7129bda6c…`](https://atlantic.pharosscan.xyz/tx/0xa8aa3ac7129bda6c2ddacff75e99a31d09286c26ebaab10c70fcaf8a8a7bd6e9)
- `cancel_stream(fair-split)` → [`0x27b19c82e4852e6c…`](https://atlantic.pharosscan.xyz/tx/0x27b19c82e4852e6c2a4d184d49af1031bf8caa3cfd66c7888d280cd8aaf6e97c)

## File Tree

```
pharos-stream-pay/
├── SKILL.md                 # this manifest (Anvita Flow / pharos-skill-engine format)
├── src/
│   ├── server.mjs           # MCP server (stdio) — all tools
│   └── lib/                 # zero-dependency runtime (EVM codec, signer, MCP, Pharos nets)
├── assets/
│   ├── networks.json        # canonical network config
│   └── deployments.json      # deployed contract addresses
├── contracts/               # original Solidity source (MIT)
├── references/
│   └── tools.md             # full per-tool parameter schemas
├── test/
│   └── smoke.mjs            # protocol + tool smoke test
└── README.md
```
