---
name: pharos-payroll-batch
description: >
  RealFi batch disbursement: pay a whole team in ONE transaction via Multicall3. Invoke this skill whenever the user or agent mentions: payroll, batch payment, mass payout, airdrop, salaries, disbursement, pay many wallets, CSV payments.
  Parse a CSV/JSON recipient list, run a full dry-run preflight (per-row validation, dedupe warnings, totals, balance and gas sufficiency), then execute: native PHRS payouts are batched into a single Multicall3 aggregate3Value transaction; ERC-20 payouts run as paced sequential transfers. Finishes with on-chain reconciliation from receipts and Transfer logs. Works on Pharos Atlantic testnet (chainId 688689)
  and Pacific mainnet (chainId 1672). Write operations sign locally with PHAROS_PRIVATE_KEY.
version: 1.0.0
requires:
  node: ">=18"
network:
  default: atlantic-testnet
  chainId: 688689
  nativeToken: PHRS
tags: [pharos, agent-skill, mcp, realfi]
license: MIT
---

# Pharos Payroll Batch

Parse a CSV/JSON recipient list, run a full dry-run preflight (per-row validation, dedupe warnings, totals, balance and gas sufficiency), then execute: native PHRS payouts are batched into a single Multicall3 aggregate3Value transaction; ERC-20 payouts run as paced sequential transfers. Finishes with on-chain reconciliation from receipts and Transfer logs. The payroll/airdrop/rewards primitive for agent-run organizations.

## Quick Start

```bash
# Run as an MCP server (stdio transport) — zero dependencies, Node 18+
node src/server.mjs
```

Register in any MCP-capable agent (Claude Desktop, Cursor, custom agents):

```json
{
  "mcpServers": {
    "pharos-payroll-batch": {
      "command": "node",
      "args": ["pharos-payroll-batch/src/server.mjs"],
      "env": { "PHAROS_PRIVATE_KEY": "<funded testnet key>" }
    }
  }
}
```

## Capability Index

| Tool | What it does |
|------|--------------|
| `parse_recipients` | Validate and normalize a recipient list. |
| `dry_run` | Full payroll preflight WITHOUT sending: validates list, sums totals, checks payer balance (native or token), estimates gas/fees, reports shortfalls. |
| `run_payroll` | EXECUTE the payroll. |
| `payout_report` | Reconcile a payroll: given tx hash(es), report per-recipient outcomes by decoding receipts and transfer logs. |

Full parameter schemas: `references/tools.md` (auto-generated from the live server).

## Network Configuration

Defaults to **Atlantic testnet** (chainId 688689). Pass `network: "mainnet"` per call for Pacific mainnet (chainId 1672). Endpoints and explorers ship in `assets/networks.json`:

| Network | RPC | ChainId | Explorer |
|---------|-----|---------|----------|
| atlantic-testnet | https://atlantic.dplabs-internal.com | 688689 | https://atlantic.pharosscan.xyz |
| mainnet | https://rpc.pharos.xyz | 1672 | https://www.pharosscan.xyz |

Override the RPC with `PHAROS_RPC_URL` if you have a dedicated endpoint.

## On-Chain Contract

This skill uses: **Multicall3 0xcA11bde05977b3631167028862bE2a173976CA11 (canonical, pre-deployed)**.

These are canonical pre-deployed contracts, verified present on Pharos via bytecode inspection.
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

Designed as part of the **PharosKit** suite — pairs naturally with `pharos-smart-account`, `pharos-token-launcher`, `pharos-chain-sentinel`. Each PharosKit skill is independent (this repo is self-contained) but they share conventions: same network config, same error shape (`{ok, error?}`), same explorer-link outputs — so agents can chain them without glue code.

## Live On-Chain Proof (Atlantic testnet)

- `run_payroll(native,multicall3)` → [`0x7dfaeed04d106031…`](https://atlantic.pharosscan.xyz/tx/0x7dfaeed04d106031d93c921986b387b31e180b16efd30de21bf93c45eee19f7e)

## File Tree

```
pharos-payroll-batch/
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
