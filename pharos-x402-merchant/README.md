<div align="center">

# Pharos x402 Merchant

**Turn any API or resource into a paid x402 endpoint on Pharos — agents EARN revenue.**

*A reusable Skill module for AI agents on [Pharos](https://pharos.xyz) — built for the Skill-to-Agent Dual Cascade Hackathon (Phase 1).*

`MCP server` · `zero dependencies` · `Node ≥18` · `MIT` · `Atlantic testnet + Pacific mainnet`

</div>

---

## What it does

The sell side of the Pharos agent economy. Create x402 PaymentRequired objects (with proper base64 headers), verify on-chain payments against them via RPC log analysis (recipient, asset, amount, confirmations, expiry), issue signed settlement receipts, quote prices in multiple assets, and spin up a complete demo paywall server. Pairs with pharos-x402-buyer for a full agent-to-agent commerce loop.

## Why agents need it

The agent economy runs on payments. Pharos ships native x402 support, sub-second finality, and micro-fee transactions — this skill turns those primitives into a single tool call an LLM can make.

## Tools

| Tool | Purpose |
|------|---------|
| `create_payment_requirements` | Create an x402 PaymentRequired object for a resource. |
| `verify_payment` | Verify that an on-chain Pharos transaction satisfies an x402 payment requirement. |
| `settle_and_receipt` | After verify_payment succeeds, produce the PAYMENT-RESPONSE settlement object (base64) to return with HTTP 200, optionally signed by the merchant key (PHAROS_PRIVATE_KEY) so buyers can prove purchase later. |
| `price_catalog` | Quote a USD price in payable Pharos assets (native PHRS + stable tokens) so agents can choose how to pay. |
| `start_paywall_server` | DEMO: start a local HTTP paywall on 127. |

→ Full parameter reference: [`references/tools.md`](references/tools.md)

## Quick start

```bash
node src/server.mjs            # starts the MCP server on stdio
node test/smoke.mjs            # protocol smoke test
```

MCP client config:

```json
{ "mcpServers": { "pharos-x402-merchant": { "command": "node", "args": ["pharos-x402-merchant/src/server.mjs"] } } }
```


## Live proof on Atlantic testnet

_Read-only skill — no transactions needed; see the demo video._

## Design principles

- **Zero runtime dependencies.** Own EVM stack (RLP, EIP-1559 signing, ABI codec, EIP-712) over vendored audited [@noble](https://github.com/paulmillr/noble-secp256k1) primitives, plus a from-scratch MCP stdio server. `npm install` is never required — nothing to supply-chain-attack.
- **Agent-first ergonomics.** Every tool returns `{ok, ...}` JSON with actionable errors, explorer links for every tx, and human-readable amounts alongside raw units.
- **Safety rails.** Read-only by design — no private key ever needed.
- **Pharos-tuned.** Handles the gas_limit-charging quirk, RPC rate-limit backoff, and 1000-block log-range caps automatically.

## PharosKit suite

This skill is 1 of 10 in **PharosKit** — a composable toolkit covering payments (x402 buyer/merchant, streams), commerce (escrow, invoices), infrastructure (smart accounts, batch payroll, monitoring), identity (registry), and tokens (launcher). Each repo is fully self-contained; together they form the base layer for Phase 2 agents.

## License

MIT
