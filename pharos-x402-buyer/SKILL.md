---
name: pharos-x402-buyer
description: >
  Let any AI agent PAY for x402-gated APIs and data on Pharos — with hard spending caps. Invoke this skill whenever the user or agent mentions: x402, HTTP 402, payment required, pay for API, paid content, micropayment, buy data, agent pays, pay-per-use.
  Implements the buyer side of the x402 (HTTP 402 Payment Required) protocol natively supported by Pharos. The agent fetches a resource; on 402 it parses the payment requirements, enforces a per-call maxPayment cap plus an optional session budget, pays on-chain (native PHRS or any ERC-20), retries with payment proof, and returns the unlocked content — a complete closed loop in one tool call.. Works on Pharos Atlantic testnet (chainId 688689)
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

# Pharos x402 Buyer

Implements the buyer side of the x402 (HTTP 402 Payment Required) protocol natively supported by Pharos. The agent fetches a resource; on 402 it parses the payment requirements, enforces a per-call maxPayment cap plus an optional session budget, pays on-chain (native PHRS or any ERC-20), retries with payment proof, and returns the unlocked content — a complete closed loop in one tool call.

## Quick Start

```bash
# Run as an MCP server (stdio transport) — zero dependencies, Node 18+
node src/server.mjs
```

Register in any MCP-capable agent (Claude Desktop, Cursor, custom agents):

```json
{
  "mcpServers": {
    "pharos-x402-buyer": {
      "command": "node",
      "args": ["pharos-x402-buyer/src/server.mjs"],
      "env": { "PHAROS_PRIVATE_KEY": "<funded testnet key>" }
    }
  }
}
```

## Capability Index

| Tool | What it does |
|------|--------------|
| `parse_requirements` | Decode an x402 PAYMENT-REQUIRED header (base64) or 402 response body into a readable payment quote WITHOUT paying. |
| `pay_requirements` | Execute the on-chain payment for a parsed x402 requirements object. |
| `fetch_with_x402` | Closed-loop x402 fetch: GET the URL; if it returns 402 with Pharos payment requirements, validate price against maxPayment, pay on-chain, retry with proof, and return the unlocked content. |
| `spending_report` | Report all x402 payments made in this session: amounts, resources, tx hashes. |

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
| `PHAROS_PRIVATE_KEY` | for write ops | signs transactions locally; never logged or transmitted |
| `PHAROS_RPC_URL` | no | override the default RPC endpoint |
| `PHAROS_NETWORK` | no | default network (`atlantic-testnet` / `mainnet`) |
| `X402_SESSION_BUDGET` | no | hard cap on total session spend (human units) |

## Security Notes

- **Zero runtime dependencies** — no npm install, no supply-chain surface. Crypto primitives are vendored builds of audited `@noble/secp256k1` + `@noble/hashes` (in `src/lib/vendor/`, fetched from esm.sh, pinned).
- No shell execution, no filesystem writes (outside explicit user-invoked flows), no telemetry, no external endpoints besides the configured Pharos RPC and the x402 resource URL you explicitly fetch.
- Private keys sign transactions **locally** (own RLP/EIP-1559 implementation, verified against known-answer test vectors); raw keys never leave the process.
- Pharos gas quirk handled: the chain charges `gas_limit` (not `gas_used`) at inclusion — estimates use a modest +15% buffer and 0 priority fee.
- Destructive/spending operations require explicit parameters (`confirm: true` flags, hard `maxPayment` caps) — the agent cannot overspend by accident.

## Composability

Designed as part of the **PharosKit** suite — pairs naturally with `pharos-x402-merchant`, `pharos-chain-sentinel`, `pharos-smart-account`. Each PharosKit skill is independent (this repo is self-contained) but they share conventions: same network config, same error shape (`{ok, error?}`), same explorer-link outputs — so agents can chain them without glue code.

## Live On-Chain Proof (Atlantic testnet)

- `fetch_with_x402(full closed loop)` → [`0x77c18c8730734a7e…`](https://atlantic.pharosscan.xyz/tx/0x77c18c8730734a7e8da9698ce4f7eaef1f59520c9546e0b3896e85eaabe640a1)

## File Tree

```
pharos-x402-buyer/
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
