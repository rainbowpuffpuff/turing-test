# Pharos Smart Account — Tool Reference

Auto-generated from the live MCP server (`tools/list`). Every tool returns JSON with an `ok` flag; failures include an actionable `error` message. Write operations also return `txHash` and an `explorer` link.

## `predict_account`

Compute the counterfactual (deterministic) smart-account address for an owner + salt, BEFORE deployment. You can fund this address immediately; deploy later.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `owner` | string | no | EOA owner (agent signing key address). Defaults to PHAROS_PRIVATE_KEY address. |
| `salt` | integer | no | account index for same owner (default 0) |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `deploy_account`

Deploy the smart account via SimpleAccountFactory.createAccount(owner, salt). Idempotent: if already deployed, reports the existing account. Costs a small amount of gas from the owner EOA.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `salt` | integer | no | default 0 |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `account_status`

Inspect a smart account: deployment status, owner, native balance, and EntryPoint deposit. Pass account address or owner+salt.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `account` | string | no |  |
| `owner` | string | no |  |
| `salt` | integer | no |  |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `build_batch`

Encode a batch of calls into SimpleAccount.executeBatch calldata. Each call: {to, value?, data?}. Returns calldata you can pass to execute (mode="raw") or inspect. Enables one-transaction multi-step agent actions.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `calls` | array | yes |  |

## `execute`

Execute through the smart account as its owner. mode="single": call execute(dest,value,data). mode="batch": calls[] are encoded via executeBatch. mode="raw": send prebuilt calldata to the account. Owner key = PHAROS_PRIVATE_KEY.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `account` | string | yes |  |
| `mode` | `single` \| `batch` \| `raw` | yes |  |
| `dest` | string | no | for single |
| `value` | string | no | wei, for single (default 0) |
| `data` | string | no | calldata for single, or raw calldata for raw |
| `calls` | array | no | for batch: [{to, value?, data?}] |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

## `withdraw`

Withdraw native PHRS/PROS from the smart account to a recipient (owner-signed execute with empty calldata).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `account` | string | yes |  |
| `to` | string | yes |  |
| `amount` | string | yes | human units (e.g. "0.5") |
| `network` | `atlantic-testnet` \| `mainnet` | no |  |

