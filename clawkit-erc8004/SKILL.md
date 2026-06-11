---
name: clawkit-erc8004
description: >
  ERC-8004 Trustless Agents operations on Mantle: mint agent identity NFTs
  (registration-v1 files as fully on-chain data URIs), post and read reputation
  feedback (giveFeedback / getSummary), request independent validations and
  post 0-100 ValidationResponses. Invoke for: agent identity, identity NFT,
  ERC-8004, reputation, feedback, attestation, validation, trustless agents,
  on-chain AI benchmarking. Registries deployed + Sourcify-verified on Mantle
  Sepolia (chainId 5003); addresses in assets/deployments.json. Write ops sign
  locally with PHAROS_PRIVATE_KEY.
version: 1.0.0
requires:
  node: ">=18"
network:
  default: mantle-sepolia
  chainId: 5003
  nativeToken: MNT
tags: [mantle, erc8004, agent-identity, reputation, validation, mcp, realclaw]
license: MIT
---

# ClawKit ERC-8004 — Trustless Agents

Run: `node src/server.mjs` (MCP stdio, zero dependencies).

Tools: register_identity · resolve_agent · give_feedback · reputation_summary ·
request_validation · respond_validation · validation_status

Original dependency-free implementation of the ERC-8004 draft — contracts in
`contracts/ERC8004.sol`, deployed + verified (exact_match) on Mantle Sepolia.
Used live by `clawkit/clawkit-economy.mjs`: identity NFT #1, 97/100 reputation
from an independent client, 100/100 validation responses from an independent
validator — agent performance benchmarked on-chain.
