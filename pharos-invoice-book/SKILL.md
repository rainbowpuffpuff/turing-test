---
name: pharos-invoice-book
description: >
  On-chain invoicing for the agent economy — issue, pay, track, reconcile. Invoke this skill whenever the user or agent mentions: invoice, bill, accounts receivable, request payment, B2B billing, payment tracking, pay invoice.
  An original InvoiceBook contract on Pharos Atlantic testnet brings B2B billing on-chain: agents issue invoices in native PHRS or any ERC-20 (USDC...), optionally payer-restricted, with due dates, short references, and memo hashes anchoring full invoice documents. Partial payments supported; funds forward directly to the issuer; every event is indexable. Works on Pharos Atlantic testnet (chainId 688689)
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

# Pharos Invoice Book

An original InvoiceBook contract on Pharos Atlantic testnet brings B2B billing on-chain: agents issue invoices in native PHRS or any ERC-20 (USDC...), optionally payer-restricted, with due dates, short references, and memo hashes anchoring full invoice documents. Partial payments supported; funds forward directly to the issuer; every event is indexable. Includes payment history scanning and issuer invoice listing from logs.

## Quick Start

```bash
# Run as an MCP server (stdio transport) — zero dependencies, Node 18+
node src/server.mjs
```

Register in any MCP-capable agent (Claude Desktop, Cursor, custom agents):

```json
{
  "mcpServers": {
    "pharos-invoice-book": {
      "command": "node",
      "args": ["pharos-invoice-book/src/server.mjs"],
      "env": { "PHAROS_PRIVATE_KEY": "<funded testnet key>" }
    }
  }
}
```

## Capability Index

| Tool | What it does |
|------|--------------|
| `create_invoice` | Issue an on-chain invoice. |
| `pay_invoice` | Pay an invoice (full or partial). |
| `invoice_status` | Read full invoice state + on-chain payment history (scanned from InvoicePaid logs). |
| `cancel_invoice` | Cancel an invoice you issued (only unpaid/partially-paid can be cancelled; received funds are kept — they were forwarded on payment). |
| `list_my_invoices` | List invoices issued by an address (scans InvoiceCreated logs over recent blocks). |

Full parameter schemas: `references/tools.md` (auto-generated from the live server).

## Network Configuration

Defaults to **Atlantic testnet** (chainId 688689). Pass `network: "mainnet"` per call for Pacific mainnet (chainId 1672). Endpoints and explorers ship in `assets/networks.json`:

| Network | RPC | ChainId | Explorer |
|---------|-----|---------|----------|
| atlantic-testnet | https://atlantic.dplabs-internal.com | 688689 | https://atlantic.pharosscan.xyz |
| mainnet | https://rpc.pharos.xyz | 1672 | https://www.pharosscan.xyz |

Override the RPC with `PHAROS_RPC_URL` if you have a dedicated endpoint.

## On-Chain Contract

This skill uses: **InvoiceBook 0x8a026720e7d83737a286c31f5eaaf8283751e96e (original, deployed on Atlantic testnet)**.

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

Designed as part of the **PharosKit** suite — pairs naturally with `pharos-x402-merchant`, `pharos-payroll-batch`, `pharos-agent-registry`. Each PharosKit skill is independent (this repo is self-contained) but they share conventions: same network config, same error shape (`{ok, error?}`), same explorer-link outputs — so agents can chain them without glue code.

## Live On-Chain Proof (Atlantic testnet)

- `create_invoice(native)` → [`0xa2a529ec29802da3…`](https://atlantic.pharosscan.xyz/tx/0xa2a529ec29802da3ba68fa00774ca413a5655a97f8352d770c9d36180b51319e)
- `create_invoice(PKDC)` → [`0x4d1e549d1eca15e5…`](https://atlantic.pharosscan.xyz/tx/0x4d1e549d1eca15e59b1dbdbdd2d6ca1f90ecf27ec2e5676f1e49b9cc405dbba4)
- `pay_invoice(native,full)` → [`0xa1b4885d4a29d0f8…`](https://atlantic.pharosscan.xyz/tx/0xa1b4885d4a29d0f8400bcc01043a713abff1488fe852404dca42aa80827110eb)
- `pay_invoice(PKDC,partial)` → [`0xae7621b66b3b0048…`](https://atlantic.pharosscan.xyz/tx/0xae7621b66b3b0048bf9bf6adefc039ee54d3d4ad79dde9d4622538da15380bd4)

## File Tree

```
pharos-invoice-book/
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
