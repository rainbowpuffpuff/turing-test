# Pharos x402 Buyer — Tool Reference

Auto-generated from the live MCP server (`tools/list`). Every tool returns JSON with an `ok` flag; failures include an actionable `error` message. Write operations also return `txHash` and an `explorer` link.

## `parse_requirements`

Decode an x402 PAYMENT-REQUIRED header (base64) or 402 response body into a readable payment quote WITHOUT paying. Use this to inspect price before authorizing.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `header` | string | no | base64 PAYMENT-REQUIRED header value |
| `body` | object | no | alternative: parsed 402 JSON body containing a requirements field |

## `pay_requirements`

Execute the on-chain payment for a parsed x402 requirements object. Enforces maxPayment (human units of the asset). Returns the txHash and the PAYMENT-SIGNATURE header to retry the request with.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `requirements` | object | yes |  |
| `maxPayment` | number | yes | hard cap in human asset units (e.g. 0.05). REQUIRED safety rail. |

## `fetch_with_x402`

Closed-loop x402 fetch: GET the URL; if it returns 402 with Pharos payment requirements, validate price against maxPayment, pay on-chain, retry with proof, and return the unlocked content. The complete "agent buys data" primitive.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `url` | string | yes | resource URL |
| `maxPayment` | number | yes | hard cap in human asset units. REQUIRED safety rail. |
| `method` | `GET` \| `POST` | no | default GET |
| `requestBody` | string | no | optional body for POST |
| `headers` | object | no | extra request headers |

## `spending_report`

Report all x402 payments made in this session: amounts, resources, tx hashes. Use for agent accounting and budget audits.

_No parameters._

