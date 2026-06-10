---
name: pharos-smart-account
description: >
  ERC-4337 smart accounts for AI agents — deterministic addresses, batched execution, separated keys. Invoke this skill whenever the user or agent mentions: smart account, account abstraction, ERC-4337, agent wallet, batch transactions, counterfactual address, deploy wallet.
  Operates the canonical ERC-4337 stack verified on Pharos (EntryPoint + SimpleAccountFactory). Predict counterfactual account addresses (fund before deploying), deploy via factory, batch many actions into ONE transaction via executeBatch, inspect account state, and withdraw. Works on Pharos Atlantic testnet (chainId 688689)
  and Pacific mainnet (chainId 1672). Write operations sign locally with PHAROS_PRIVATE_KEY.
version: 1.0.0
requires:
  node: ">=18"
network:
  default: atlantic-testnet
  chainId: 688689
  nativeToken: PHRS
tags: [pharos, agent-skill, mcp, agent-infrastructure]
license: MIT
---

# Pharos Smart Account

Operates the canonical ERC-4337 stack verified on Pharos (EntryPoint + SimpleAccountFactory). Predict counterfactual account addresses (fund before deploying), deploy via factory, batch many actions into ONE transaction via executeBatch, inspect account state, and withdraw. Smart accounts give agents a treasury separated from the signing key — the foundation for session keys and paymasters in Phase 2 agent architectures.

## Quick Start

```bash
# Run as an MCP server (stdio transport) — zero dependencies, Node 18+
node src/server.mjs
```

Register in any MCP-capable agent (Claude Desktop, Cursor, custom agents):

```json
{
  "mcpServers": {
    "pharos-smart-account": {
      "command": "node",
      "args": ["pharos-smart-account/src/server.mjs"],
      "env": { "PHAROS_PRIVATE_KEY": "<funded testnet key>" }
    }
  }
}
```

## Capability Index

| Tool | What it does |
|------|--------------|
| `predict_account` | Compute the counterfactual (deterministic) smart-account address for an owner + salt, BEFORE deployment. |
| `deploy_account` | Deploy the smart account via SimpleAccountFactory. |
| `account_status` | Inspect a smart account: deployment status, owner, native balance, and EntryPoint deposit. |
| `build_batch` | Encode a batch of calls into SimpleAccount. |
| `execute` | Execute through the smart account as its owner. |
| `withdraw` | Withdraw native PHRS/PROS from the smart account to a recipient (owner-signed execute with empty calldata). |

Full parameter schemas: `references/tools.md` (auto-generated from the live server).

## Network Configuration

Defaults to **Atlantic testnet** (chainId 688689). Pass `network: "mainnet"` per call for Pacific mainnet (chainId 1672). Endpoints and explorers ship in `assets/networks.json`:

| Network | RPC | ChainId | Explorer |
|---------|-----|---------|----------|
| atlantic-testnet | https://atlantic.dplabs-internal.com | 688689 | https://atlantic.pharosscan.xyz |
| mainnet | https://rpc.pharos.xyz | 1672 | https://www.pharosscan.xyz |

Override the RPC with `PHAROS_RPC_URL` if you have a dedicated endpoint.

## On-Chain Contract

This skill uses: **EntryPoint v0.6 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789 + SimpleAccountFactory 0x9406Cc6185a346906296840746125a0E44976454 (canonical, pre-deployed)**.

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

Designed as part of the **PharosKit** suite — pairs naturally with `pharos-payroll-batch`, `pharos-token-launcher`, `pharos-agent-escrow`. Each PharosKit skill is independent (this repo is self-contained) but they share conventions: same network config, same error shape (`{ok, error?}`), same explorer-link outputs — so agents can chain them without glue code.

## Live On-Chain Proof (Atlantic testnet)

- `deploy_account` → [`0x99bf8d55ece283a9…`](https://atlantic.pharosscan.xyz/tx/0x99bf8d55ece283a9bb0101a31f03f38c7dce0ad1a7ca3ac62cc939503d43eccd)
- `fund_account(via payroll multicall)` → [`0x3c9a789e5067bc49…`](https://atlantic.pharosscan.xyz/tx/0x3c9a789e5067bc494393ed0aafa3a5710747276cf8b4652844657f737efc2ff7)
- `mint_PKDC_to_account` → [`0x2b82d860a5ef5b34…`](https://atlantic.pharosscan.xyz/tx/0x2b82d860a5ef5b34b223a671c3f4f4c94412771ced9eeee44a4f9dc3a1f4d1d1)
- `executeBatch(2 PKDC transfers, 1 tx)` → [`0x710915bc760f25f0…`](https://atlantic.pharosscan.xyz/tx/0x710915bc760f25f0cc69e5f5b014169689cae8491210b984d049265e1dc7e30c)

## File Tree

```
pharos-smart-account/
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
