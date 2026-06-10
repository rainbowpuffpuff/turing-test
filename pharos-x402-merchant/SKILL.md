---
name: pharos-x402-merchant
description: >
  Turn any API or resource into a paid x402 endpoint on Pharos — agents EARN revenue. Invoke this skill whenever the user or agent mentions: monetize API, sell data, x402 server, paywall, charge for content, accept crypto payments, verify payment, micropayment merchant.
  The sell side of the Pharos agent economy. Create x402 PaymentRequired objects (with proper base64 headers), verify on-chain payments against them via RPC log analysis (recipient, asset, amount, confirmations, expiry), issue signed settlement receipts, quote prices in multiple assets, and spin up a complete demo paywall server. Works on Pharos Atlantic testnet (chainId 688689)
  and Pacific mainnet (chainId 1672). Read-only: no private key required.
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

# Pharos x402 Merchant

The sell side of the Pharos agent economy. Create x402 PaymentRequired objects (with proper base64 headers), verify on-chain payments against them via RPC log analysis (recipient, asset, amount, confirmations, expiry), issue signed settlement receipts, quote prices in multiple assets, and spin up a complete demo paywall server. Pairs with pharos-x402-buyer for a full agent-to-agent commerce loop.

## Quick Start

```bash
# Run as an MCP server (stdio transport) — zero dependencies, Node 18+
node src/server.mjs
```

Register in any MCP-capable agent (Claude Desktop, Cursor, custom agents):

```json
{
  "mcpServers": {
    "pharos-x402-merchant": {
      "command": "node",
      "args": ["pharos-x402-merchant/src/server.mjs"]
    }
  }
}
```

## Capability Index

| Tool | What it does |
|------|--------------|
| `create_payment_requirements` | Create an x402 PaymentRequired object for a resource. |
| `verify_payment` | Verify that an on-chain Pharos transaction satisfies an x402 payment requirement. |
| `settle_and_receipt` | After verify_payment succeeds, produce the PAYMENT-RESPONSE settlement object (base64) to return with HTTP 200, optionally signed by the merchant key (PHAROS_PRIVATE_KEY) so buyers can prove purchase later. |
| `price_catalog` | Quote a USD price in payable Pharos assets (native PHRS + stable tokens) so agents can choose how to pay. |
| `start_paywall_server` | DEMO: start a local HTTP paywall on 127. |

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
- No shell execution, no filesystem writes (outside explicit user-invoked flows), no telemetry, no external endpoints besides the configured Pharos RPC and the x402 resource URL you explicitly fetch.
- Private keys sign transactions **locally** (own RLP/EIP-1559 implementation, verified against known-answer test vectors); raw keys never leave the process.
- Pharos gas quirk handled: the chain charges `gas_limit` (not `gas_used`) at inclusion — estimates use a modest +15% buffer and 0 priority fee.

## Composability

Designed as part of the **PharosKit** suite — pairs naturally with `pharos-x402-buyer`, `pharos-invoice-book`, `pharos-agent-registry`. Each PharosKit skill is independent (this repo is self-contained) but they share conventions: same network config, same error shape (`{ok, error?}`), same explorer-link outputs — so agents can chain them without glue code.

## Live On-Chain Proof (Atlantic testnet)

_Read-only skill — see demo video for live usage; no transactions required._

## File Tree

```
pharos-x402-merchant/
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
