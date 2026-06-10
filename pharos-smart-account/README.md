<div align="center">

# Pharos Smart Account

**ERC-4337 smart accounts for AI agents — deterministic addresses, batched execution, separated keys.**

*A reusable Skill module for AI agents on [Pharos](https://pharos.xyz) — built for the Skill-to-Agent Dual Cascade Hackathon (Phase 1).*

`MCP server` · `zero dependencies` · `Node ≥18` · `MIT` · `Atlantic testnet + Pacific mainnet`

</div>

---

## What it does

Operates the canonical ERC-4337 stack verified on Pharos (EntryPoint + SimpleAccountFactory). Predict counterfactual account addresses (fund before deploying), deploy via factory, batch many actions into ONE transaction via executeBatch, inspect account state, and withdraw. Smart accounts give agents a treasury separated from the signing key — the foundation for session keys and paymasters in Phase 2 agent architectures.

## Why agents need it

Every autonomous agent needs reliable, structured observation of chain state to act on. This skill is that observation layer, designed for agent polling loops.

## Tools

| Tool | Purpose |
|------|---------|
| `predict_account` | Compute the counterfactual (deterministic) smart-account address for an owner + salt, BEFORE deployment. |
| `deploy_account` | Deploy the smart account via SimpleAccountFactory. |
| `account_status` | Inspect a smart account: deployment status, owner, native balance, and EntryPoint deposit. |
| `build_batch` | Encode a batch of calls into SimpleAccount. |
| `execute` | Execute through the smart account as its owner. |
| `withdraw` | Withdraw native PHRS/PROS from the smart account to a recipient (owner-signed execute with empty calldata). |

→ Full parameter reference: [`references/tools.md`](references/tools.md)

## Quick start

```bash
node src/server.mjs            # starts the MCP server on stdio
node test/smoke.mjs            # protocol smoke test
```

MCP client config:

```json
{ "mcpServers": { "pharos-smart-account": { "command": "node", "args": ["pharos-smart-account/src/server.mjs"], "env": { "PHAROS_PRIVATE_KEY": "<key>" } } } }
```

## On-chain contract

EntryPoint v0.6 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789 + SimpleAccountFactory 0x9406Cc6185a346906296840746125a0E44976454 (canonical, pre-deployed)

## Live proof on Atlantic testnet

- `deploy_account` → [`0x99bf8d55ece283a9…`](https://atlantic.pharosscan.xyz/tx/0x99bf8d55ece283a9bb0101a31f03f38c7dce0ad1a7ca3ac62cc939503d43eccd)
- `fund_account(via payroll multicall)` → [`0x3c9a789e5067bc49…`](https://atlantic.pharosscan.xyz/tx/0x3c9a789e5067bc494393ed0aafa3a5710747276cf8b4652844657f737efc2ff7)
- `mint_PKDC_to_account` → [`0x2b82d860a5ef5b34…`](https://atlantic.pharosscan.xyz/tx/0x2b82d860a5ef5b34b223a671c3f4f4c94412771ced9eeee44a4f9dc3a1f4d1d1)
- `executeBatch(2 PKDC transfers, 1 tx)` → [`0x710915bc760f25f0…`](https://atlantic.pharosscan.xyz/tx/0x710915bc760f25f0cc69e5f5b014169689cae8491210b984d049265e1dc7e30c)

## Design principles

- **Zero runtime dependencies.** Own EVM stack (RLP, EIP-1559 signing, ABI codec, EIP-712) over vendored audited [@noble](https://github.com/paulmillr/noble-secp256k1) primitives, plus a from-scratch MCP stdio server. `npm install` is never required — nothing to supply-chain-attack.
- **Agent-first ergonomics.** Every tool returns `{ok, ...}` JSON with actionable errors, explorer links for every tx, and human-readable amounts alongside raw units.
- **Safety rails.** Spending caps (`maxPayment`), explicit `confirm: true` gates on irreversible actions, schema validation on every call, and local-only key handling.
- **Pharos-tuned.** Handles the gas_limit-charging quirk, RPC rate-limit backoff, and 1000-block log-range caps automatically.

## PharosKit suite

This skill is 1 of 10 in **PharosKit** — a composable toolkit covering payments (x402 buyer/merchant, streams), commerce (escrow, invoices), infrastructure (smart accounts, batch payroll, monitoring), identity (registry), and tokens (launcher). Each repo is fully self-contained; together they form the base layer for Phase 2 agents.

## License

MIT
