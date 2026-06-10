---
name: pharos-agent-escrow
description: >
  Trustless escrow for agent-to-agent service commerce: lock, deliver with proof, release. Invoke this skill whenever the user or agent mentions: escrow, hire agent, lock payment, task payment, trustless work, delivery proof, dispute, milestone payment.
  An original AgentEscrow contract deployed on Pharos Atlantic testnet powers trustless task commerce between agents (or humans hiring agents). Clients lock native PHRS for a task spec (hash anchored on-chain); workers accept, deliver with a keccak256 proof of the artifact, and get paid on release — with deadline refunds, a dispute window, and mutual bps-split resolution. Works on Pharos Atlantic testnet (chainId 688689)
  and Pacific mainnet (chainId 1672). Write operations sign locally with PHAROS_PRIVATE_KEY.
version: 1.0.0
requires:
  node: ">=18"
network:
  default: atlantic-testnet
  chainId: 688689
  nativeToken: PHRS
tags: [pharos, agent-skill, mcp, agent-commerce]
license: MIT
---

# Pharos Agent Escrow

An original AgentEscrow contract deployed on Pharos Atlantic testnet powers trustless task commerce between agents (or humans hiring agents). Clients lock native PHRS for a task spec (hash anchored on-chain); workers accept, deliver with a keccak256 proof of the artifact, and get paid on release — with deadline refunds, a dispute window, and mutual bps-split resolution. Every state change is an indexed event.

## Quick Start

```bash
# Run as an MCP server (stdio transport) — zero dependencies, Node 18+
node src/server.mjs
```

Register in any MCP-capable agent (Claude Desktop, Cursor, custom agents):

```json
{
  "mcpServers": {
    "pharos-agent-escrow": {
      "command": "node",
      "args": ["pharos-agent-escrow/src/server.mjs"],
      "env": { "PHAROS_PRIVATE_KEY": "<funded testnet key>" }
    }
  }
}
```

## Capability Index

| Tool | What it does |
|------|--------------|
| `hash_artifact` | Compute keccak256 of a task specification or delivery artifact (string). |
| `create_escrow` | Create and fund an escrow with native PHRS. |
| `accept_task` | Accept an open escrow task as the worker (your PHAROS_PRIVATE_KEY address becomes the designated worker). |
| `submit_delivery` | Submit delivery proof as the worker: pass the delivery content (hashed automatically) or a precomputed 0x hash. |
| `release_payment` | As the client, release escrowed funds to the worker (accept the delivery). |
| `claim_after_window` | As the worker, self-claim payment after the dispute window passed with no dispute. |
| `refund_expired` | As the client, reclaim funds from an unaccepted task or one whose deadline passed without delivery. |
| `open_dispute` | As the client, open a dispute during the dispute window after delivery. |
| `propose_resolution` | Propose (or accept) a dispute resolution split. |
| `get_escrow` | Read the full state of an escrow by id. |

Full parameter schemas: `references/tools.md` (auto-generated from the live server).

## Network Configuration

Defaults to **Atlantic testnet** (chainId 688689). Pass `network: "mainnet"` per call for Pacific mainnet (chainId 1672). Endpoints and explorers ship in `assets/networks.json`:

| Network | RPC | ChainId | Explorer |
|---------|-----|---------|----------|
| atlantic-testnet | https://atlantic.dplabs-internal.com | 688689 | https://atlantic.pharosscan.xyz |
| mainnet | https://rpc.pharos.xyz | 1672 | https://www.pharosscan.xyz |

Override the RPC with `PHAROS_RPC_URL` if you have a dedicated endpoint.

## On-Chain Contract

This skill uses: **AgentEscrow 0x22a43e08b67dab1f46a8f908834cd7e37e3fa3cd (original, deployed on Atlantic testnet)**.

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

Designed as part of the **PharosKit** suite — pairs naturally with `pharos-agent-registry`, `pharos-chain-sentinel`, `pharos-stream-pay`. Each PharosKit skill is independent (this repo is self-contained) but they share conventions: same network config, same error shape (`{ok, error?}`), same explorer-link outputs — so agents can chain them without glue code.

## Live On-Chain Proof (Atlantic testnet)

- `create_escrow` → [`0x2b38e9578da794b3…`](https://atlantic.pharosscan.xyz/tx/0x2b38e9578da794b37d4b6ddf07a855b67861b0310a74199fb8200f33b6facb04)
- `submit_delivery` → [`0x7fee06ef8d87b45b…`](https://atlantic.pharosscan.xyz/tx/0x7fee06ef8d87b45b915adbcd6f3310b3be90364c03e9f77880397489396348de)
- `release_payment` → [`0xdedd5d10d833fe5a…`](https://atlantic.pharosscan.xyz/tx/0xdedd5d10d833fe5ac8a70c03b6d66841f5427e62bca0320cba9632e2dec1b688)

## File Tree

```
pharos-agent-escrow/
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
