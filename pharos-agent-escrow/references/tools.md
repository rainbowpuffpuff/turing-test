# Pharos Agent Escrow — Tool Reference

Auto-generated from the live MCP server (`tools/list`). Every tool returns JSON with an `ok` flag; failures include an actionable `error` message. Write operations also return `txHash` and an `explorer` link.

## `hash_artifact`

Compute keccak256 of a task specification or delivery artifact (string). Use the hash as taskHash when creating an escrow, and as deliveryHash when submitting work — anchoring off-chain content on-chain.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `content` | string | yes |  |

## `create_escrow`

Create and fund an escrow with native PHRS. worker=0x0 (or omitted) makes it an open task anyone can accept. amount is in human units (e.g. "0.01"). deadlineMinutes from now. disputeWindowMinutes after delivery.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `amount` | string | yes |  |
| `worker` | string | no | optional designated worker |
| `deadlineMinutes` | integer | no | time for worker to deliver (default 60) |
| `disputeWindowMinutes` | integer | no | client dispute window after delivery (default 30) |
| `taskSpec` | string | yes | task description — hashed on-chain as taskHash |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `accept_task`

Accept an open escrow task as the worker (your PHAROS_PRIVATE_KEY address becomes the designated worker).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `escrowId` | integer | yes |  |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `submit_delivery`

Submit delivery proof as the worker: pass the delivery content (hashed automatically) or a precomputed 0x hash.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `escrowId` | integer | yes |  |
| `deliveryContent` | string | no | artifact content to hash |
| `deliveryHash` | string | no | alternative: precomputed hash |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `release_payment`

As the client, release escrowed funds to the worker (accept the delivery).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `escrowId` | integer | yes |  |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `claim_after_window`

As the worker, self-claim payment after the dispute window passed with no dispute.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `escrowId` | integer | yes |  |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `refund_expired`

As the client, reclaim funds from an unaccepted task or one whose deadline passed without delivery.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `escrowId` | integer | yes |  |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `open_dispute`

As the client, open a dispute during the dispute window after delivery.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `escrowId` | integer | yes |  |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `propose_resolution`

Propose (or accept) a dispute resolution split. workerShareBps: 0-10000 (e.g. 5000 = 50% to worker). When both parties call with the same value, funds settle automatically.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `escrowId` | integer | yes |  |
| `workerShareBps` | integer | yes |  |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `get_escrow`

Read the full state of an escrow by id.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `escrowId` | integer | yes |  |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

