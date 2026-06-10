<div align="center">

# Pharos Invoice Book

**On-chain invoicing for the agent economy — issue, pay, track, reconcile.**

*A reusable Skill module for AI agents on [Pharos](https://pharos.xyz) — built for the Skill-to-Agent Dual Cascade Hackathon (Phase 1).*

`MCP server` · `zero dependencies` · `Node ≥18` · `MIT` · `Atlantic testnet + Pacific mainnet`

</div>

---

## What it does

An original InvoiceBook contract on Pharos Atlantic testnet brings B2B billing on-chain: agents issue invoices in native PHRS or any ERC-20 (USDC...), optionally payer-restricted, with due dates, short references, and memo hashes anchoring full invoice documents. Partial payments supported; funds forward directly to the issuer; every event is indexable. Includes payment history scanning and issuer invoice listing from logs.

## Why agents need it

Pharos targets RealFi — real financial workflows on-chain. This skill packages one of those workflows (with validation, dry-runs, and reconciliation) so an agent can run it safely end-to-end.

## Tools

| Tool | Purpose |
|------|---------|
| `create_invoice` | Issue an on-chain invoice. |
| `pay_invoice` | Pay an invoice (full or partial). |
| `invoice_status` | Read full invoice state + on-chain payment history (scanned from InvoicePaid logs). |
| `cancel_invoice` | Cancel an invoice you issued (only unpaid/partially-paid can be cancelled; received funds are kept — they were forwarded on payment). |
| `list_my_invoices` | List invoices issued by an address (scans InvoiceCreated logs over recent blocks). |

→ Full parameter reference: [`references/tools.md`](references/tools.md)

## Quick start

```bash
node src/server.mjs            # starts the MCP server on stdio
node test/smoke.mjs            # protocol smoke test
```

MCP client config:

```json
{ "mcpServers": { "pharos-invoice-book": { "command": "node", "args": ["pharos-invoice-book/src/server.mjs"], "env": { "PHAROS_PRIVATE_KEY": "<key>" } } } }
```

## On-chain contract

InvoiceBook 0x8a026720e7d83737a286c31f5eaaf8283751e96e (original, deployed on Atlantic testnet) — Solidity source in [`contracts/`](contracts/), original and dependency-free.

## Live proof on Atlantic testnet

- `create_invoice(native)` → [`0xa2a529ec29802da3…`](https://atlantic.pharosscan.xyz/tx/0xa2a529ec29802da3ba68fa00774ca413a5655a97f8352d770c9d36180b51319e)
- `create_invoice(PKDC)` → [`0x4d1e549d1eca15e5…`](https://atlantic.pharosscan.xyz/tx/0x4d1e549d1eca15e59b1dbdbdd2d6ca1f90ecf27ec2e5676f1e49b9cc405dbba4)
- `pay_invoice(native,full)` → [`0xa1b4885d4a29d0f8…`](https://atlantic.pharosscan.xyz/tx/0xa1b4885d4a29d0f8400bcc01043a713abff1488fe852404dca42aa80827110eb)
- `pay_invoice(PKDC,partial)` → [`0xae7621b66b3b0048…`](https://atlantic.pharosscan.xyz/tx/0xae7621b66b3b0048bf9bf6adefc039ee54d3d4ad79dde9d4622538da15380bd4)

## Design principles

- **Zero runtime dependencies.** Own EVM stack (RLP, EIP-1559 signing, ABI codec, EIP-712) over vendored audited [@noble](https://github.com/paulmillr/noble-secp256k1) primitives, plus a from-scratch MCP stdio server. `npm install` is never required — nothing to supply-chain-attack.
- **Agent-first ergonomics.** Every tool returns `{ok, ...}` JSON with actionable errors, explorer links for every tx, and human-readable amounts alongside raw units.
- **Safety rails.** Spending caps (`maxPayment`), explicit `confirm: true` gates on irreversible actions, schema validation on every call, and local-only key handling.
- **Pharos-tuned.** Handles the gas_limit-charging quirk, RPC rate-limit backoff, and 1000-block log-range caps automatically.

## PharosKit suite

This skill is 1 of 10 in **PharosKit** — a composable toolkit covering payments (x402 buyer/merchant, streams), commerce (escrow, invoices), infrastructure (smart accounts, batch payroll, monitoring), identity (registry), and tokens (launcher). Each repo is fully self-contained; together they form the base layer for Phase 2 agents.

## License

MIT
