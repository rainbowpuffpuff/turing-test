# Pharos x402 Merchant — Tool Reference

Auto-generated from the live MCP server (`tools/list`). Every tool returns JSON with an `ok` flag; failures include an actionable `error` message. Write operations also return `txHash` and an `explorer` link.

## `create_payment_requirements`

Create an x402 PaymentRequired object for a resource. Returns both JSON and the base64 header value to send with HTTP 402. amount is a decimal string in token units (e.g. "0.01"). asset is "native" for PHRS or a token symbol/address (e.g. "USDC").

| Parameter | Type | Required | Description |
|---|---|---|---|
| `payTo` | string | yes | merchant receiving address |
| `amount` | string | yes | price in human units, e.g. "0.05" |
| `asset` | string | no | "native" \| token symbol (USDC, USDT, WPHRS...) \| 0x token address |
| `resource` | string | yes | resource identifier, e.g. "GET /api/report/42" |
| `description` | string | no | human/agent readable description of what is being sold |
| `network` | `atlantic-testnet` \| `mainnet` | no | default atlantic-testnet |
| `validForSeconds` | integer | no | requirement expiry (default 3600) |

## `verify_payment`

Verify that an on-chain Pharos transaction satisfies an x402 payment requirement. Accepts the requirements object (or its base64) plus the payment proof {txHash}. Checks recipient, asset, amount, confirmation status, and requirement expiry.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `requirements` | object | no | the PaymentRequired object from create_payment_requirements |
| `requirementsB64` | string | no | alternative: base64-encoded requirements (PAYMENT-REQUIRED header value) |
| `txHash` | string | yes |  |
| `minConfirmations` | integer | no | default 1 |

## `settle_and_receipt`

After verify_payment succeeds, produce the PAYMENT-RESPONSE settlement object (base64) to return with HTTP 200, optionally signed by the merchant key (PHAROS_PRIVATE_KEY) so buyers can prove purchase later.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `requirements` | object | yes |  |
| `txHash` | string | yes |  |
| `payer` | string | yes |  |
| `sign` | boolean | no | sign receipt with PHAROS_PRIVATE_KEY (default true if key present) |

## `price_catalog`

Quote a USD price in payable Pharos assets (native PHRS + stable tokens) so agents can choose how to pay. Uses 1 USDC = 1 USD; native quoted only if priceNativeUsd provided (no oracle dependency).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `usd` | number | yes | price in USD |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |
| `priceNativeUsd` | number | no | optional PHRS/PROS price in USD for native quoting |

## `start_paywall_server`

DEMO: start a local HTTP paywall on 127.0.0.1 that protects a sample resource with x402. Returns the URL. The server enforces: 402 with PAYMENT-REQUIRED → client pays on Pharos → retries with PAYMENT-SIGNATURE → 200 + PAYMENT-RESPONSE. Binds to localhost only and auto-stops after ttlSeconds.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `payTo` | string | yes |  |
| `amount` | string | yes |  |
| `asset` | string | no |  |
| `port` | integer | no |  |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |
| `ttlSeconds` | integer | no | auto-shutdown (default 600) |
| `resourceBody` | string | no | the protected content to serve (default: sample premium JSON) |

