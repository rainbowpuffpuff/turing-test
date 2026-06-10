<div align="center">

# Pharos x402 Buyer

**Let any AI agent PAY for x402-gated APIs and data on Pharos — with hard spending caps.**

*A reusable Skill module for AI agents on [Pharos](https://pharos.xyz) — built for the Skill-to-Agent Dual Cascade Hackathon (Phase 1).*

`MCP server` · `zero dependencies` · `Node ≥18` · `MIT` · `Atlantic testnet + Pacific mainnet`

</div>

---

## What it does

Implements the buyer side of the x402 (HTTP 402 Payment Required) protocol natively supported by Pharos. The agent fetches a resource; on 402 it parses the payment requirements, enforces a per-call maxPayment cap plus an optional session budget, pays on-chain (native PHRS or any ERC-20), retries with payment proof, and returns the unlocked content — a complete closed loop in one tool call.

## Why agents need it

The agent economy runs on payments. Pharos ships native x402 support, sub-second finality, and micro-fee transactions — this skill turns those primitives into a single tool call an LLM can make.

## Tools

| Tool | Purpose |
|------|---------|
| `parse_requirements` | Decode an x402 PAYMENT-REQUIRED header (base64) or 402 response body into a readable payment quote WITHOUT paying. |
| `pay_requirements` | Execute the on-chain payment for a parsed x402 requirements object. |
| `fetch_with_x402` | Closed-loop x402 fetch: GET the URL; if it returns 402 with Pharos payment requirements, validate price against maxPayment, pay on-chain, retry with proof, and return the unlocked content. |
| `spending_report` | Report all x402 payments made in this session: amounts, resources, tx hashes. |

→ Full parameter reference: [`references/tools.md`](references/tools.md)

## Quick start

```bash
node src/server.mjs            # starts the MCP server on stdio
node test/smoke.mjs            # protocol smoke test
```

MCP client config:

```json
{ "mcpServers": { "pharos-x402-buyer": { "command": "node", "args": ["pharos-x402-buyer/src/server.mjs"], "env": { "PHAROS_PRIVATE_KEY": "<key>" } } } }
```


## Live proof on Atlantic testnet

- `fetch_with_x402(full closed loop)` → [`0x77c18c8730734a7e…`](https://atlantic.pharosscan.xyz/tx/0x77c18c8730734a7e8da9698ce4f7eaef1f59520c9546e0b3896e85eaabe640a1)

## Design principles

- **Zero runtime dependencies.** Own EVM stack (RLP, EIP-1559 signing, ABI codec, EIP-712) over vendored audited [@noble](https://github.com/paulmillr/noble-secp256k1) primitives, plus a from-scratch MCP stdio server. `npm install` is never required — nothing to supply-chain-attack.
- **Agent-first ergonomics.** Every tool returns `{ok, ...}` JSON with actionable errors, explorer links for every tx, and human-readable amounts alongside raw units.
- **Safety rails.** Spending caps (`maxPayment`), explicit `confirm: true` gates on irreversible actions, schema validation on every call, and local-only key handling.
- **Pharos-tuned.** Handles the gas_limit-charging quirk, RPC rate-limit backoff, and 1000-block log-range caps automatically.

## PharosKit suite

This skill is 1 of 10 in **PharosKit** — a composable toolkit covering payments (x402 buyer/merchant, streams), commerce (escrow, invoices), infrastructure (smart accounts, batch payroll, monitoring), identity (registry), and tokens (launcher). Each repo is fully self-contained; together they form the base layer for Phase 2 agents.

## License

MIT
