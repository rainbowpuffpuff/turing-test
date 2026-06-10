<div align="center">

# Pharos Payroll Batch

**RealFi batch disbursement: pay a whole team in ONE transaction via Multicall3.**

*A reusable Skill module for AI agents on [Pharos](https://pharos.xyz) — built for the Skill-to-Agent Dual Cascade Hackathon (Phase 1).*

`MCP server` · `zero dependencies` · `Node ≥18` · `MIT` · `Atlantic testnet + Pacific mainnet`

</div>

---

## What it does

Parse a CSV/JSON recipient list, run a full dry-run preflight (per-row validation, dedupe warnings, totals, balance and gas sufficiency), then execute: native PHRS payouts are batched into a single Multicall3 aggregate3Value transaction; ERC-20 payouts run as paced sequential transfers. Finishes with on-chain reconciliation from receipts and Transfer logs. The payroll/airdrop/rewards primitive for agent-run organizations.

## Why agents need it

Pharos targets RealFi — real financial workflows on-chain. This skill packages one of those workflows (with validation, dry-runs, and reconciliation) so an agent can run it safely end-to-end.

## Tools

| Tool | Purpose |
|------|---------|
| `parse_recipients` | Validate and normalize a recipient list. |
| `dry_run` | Full payroll preflight WITHOUT sending: validates list, sums totals, checks payer balance (native or token), estimates gas/fees, reports shortfalls. |
| `run_payroll` | EXECUTE the payroll. |
| `payout_report` | Reconcile a payroll: given tx hash(es), report per-recipient outcomes by decoding receipts and transfer logs. |

→ Full parameter reference: [`references/tools.md`](references/tools.md)

## Quick start

```bash
node src/server.mjs            # starts the MCP server on stdio
node test/smoke.mjs            # protocol smoke test
```

MCP client config:

```json
{ "mcpServers": { "pharos-payroll-batch": { "command": "node", "args": ["pharos-payroll-batch/src/server.mjs"], "env": { "PHAROS_PRIVATE_KEY": "<key>" } } } }
```

## On-chain contract

Multicall3 0xcA11bde05977b3631167028862bE2a173976CA11 (canonical, pre-deployed)

## Live proof on Atlantic testnet

- `run_payroll(native,multicall3)` → [`0x7dfaeed04d106031…`](https://atlantic.pharosscan.xyz/tx/0x7dfaeed04d106031d93c921986b387b31e180b16efd30de21bf93c45eee19f7e)

## Design principles

- **Zero runtime dependencies.** Own EVM stack (RLP, EIP-1559 signing, ABI codec, EIP-712) over vendored audited [@noble](https://github.com/paulmillr/noble-secp256k1) primitives, plus a from-scratch MCP stdio server. `npm install` is never required — nothing to supply-chain-attack.
- **Agent-first ergonomics.** Every tool returns `{ok, ...}` JSON with actionable errors, explorer links for every tx, and human-readable amounts alongside raw units.
- **Safety rails.** Spending caps (`maxPayment`), explicit `confirm: true` gates on irreversible actions, schema validation on every call, and local-only key handling.
- **Pharos-tuned.** Handles the gas_limit-charging quirk, RPC rate-limit backoff, and 1000-block log-range caps automatically.

## PharosKit suite

This skill is 1 of 10 in **PharosKit** — a composable toolkit covering payments (x402 buyer/merchant, streams), commerce (escrow, invoices), infrastructure (smart accounts, batch payroll, monitoring), identity (registry), and tokens (launcher). Each repo is fully self-contained; together they form the base layer for Phase 2 agents.

## License

MIT
