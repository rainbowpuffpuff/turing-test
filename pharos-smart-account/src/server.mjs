#!/usr/bin/env node
// pharos-smart-account — MCP server
// ERC-4337 smart accounts for AI agents on Pharos. Uses the canonical
// EntryPoint v0.6 (0x5FF137D4...) + SimpleAccountFactory deployed on
// Pharos Atlantic testnet & Pacific mainnet (verified bytecode on-chain).
//
// Why agents need this: a smart account separates the agent's signing key
// from the treasury, enables batched multi-call execution (one tx, many
// actions), deterministic addresses (fund before deploy), and is the
// foundation for session keys / paymasters in Phase 2 agent designs.
//
// Tools:
//   predict_account     — compute the counterfactual smart-account address
//   deploy_account      — deploy via factory.createAccount (regular tx; no bundler needed)
//   account_status      — code presence, owner, balances, entryPoint deposit
//   build_batch         — encode executeBatch(dest[], value[], func[]) calldata
//   execute             — owner-driven execute/executeBatch through the account
//   withdraw            — pull native funds out of the account to a recipient
import { McpServer } from './lib/mcp.mjs';
import { Rpc, encodeCall, abiDecode, abiEncode, bytesToHex, hexToBytes, concat, selector, parseUnits, formatUnits, checksum, keccak } from './lib/evm.mjs';
import { getNetwork, rpcFor, walletFor, txLink, addrLink } from './lib/pharos.mjs';

const VERSION = '1.0.0';
// Canonical ERC-4337 v0.6 stack (verified present on Pharos via eth_getCode)
const ENTRYPOINT_V06 = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';
const FACTORY_V06 = '0x9406Cc6185a346906296840746125a0E44976454';

const server = new McpServer({
  name: 'pharos-smart-account',
  version: VERSION,
  instructions: 'Create and operate ERC-4337 smart accounts for agents on Pharos. Predict deterministic addresses, deploy, batch-execute calls, and manage funds. Write ops need PHAROS_PRIVATE_KEY (the account owner key).',
});

async function predictedAddress(rpc, owner, salt) {
  const data = encodeCall('getAddress(address,uint256)', [owner, salt]);
  const out = await rpc.ethCall(FACTORY_V06, data);
  return abiDecode(['address'], out)[0];
}

// ---------------------------------------------------------------- predict_account
server.tool(
  'predict_account',
  'Compute the counterfactual (deterministic) smart-account address for an owner + salt, BEFORE deployment. You can fund this address immediately; deploy later.',
  {
    type: 'object',
    properties: {
      owner: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$', description: 'EOA owner (agent signing key address). Defaults to PHAROS_PRIVATE_KEY address.' },
      salt: { type: 'integer', minimum: 0, description: 'account index for same owner (default 0)' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] },
    },
  },
  async ({ owner, salt = 0, network }) => {
    const rpc = rpcFor(network);
    if (!owner) {
      const w = walletFor(network);
      owner = w.address;
    }
    const account = await predictedAddress(rpc, owner, salt);
    const code = await rpc.call('eth_getCode', [account, 'latest']);
    return {
      ok: true,
      owner: checksum(owner),
      salt,
      account,
      deployed: code !== '0x',
      entryPoint: ENTRYPOINT_V06,
      factory: FACTORY_V06,
      explorer: addrLink(account, network),
      note: 'You can send PHRS/tokens to this address now — it is owned by your key even before deployment.',
    };
  }
);

// ---------------------------------------------------------------- deploy_account
server.tool(
  'deploy_account',
  'Deploy the smart account via SimpleAccountFactory.createAccount(owner, salt). Idempotent: if already deployed, reports the existing account. Costs a small amount of gas from the owner EOA.',
  {
    type: 'object',
    properties: {
      salt: { type: 'integer', minimum: 0, description: 'default 0' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] },
    },
  },
  async ({ salt = 0, network }) => {
    const wallet = walletFor(network);
    const account = await predictedAddress(wallet.rpc, wallet.address, salt);
    const pre = await wallet.rpc.call('eth_getCode', [account, 'latest']);
    if (pre !== '0x') {
      return { ok: true, account, alreadyDeployed: true, explorer: addrLink(account, network) };
    }
    const data = encodeCall('createAccount(address,uint256)', [wallet.address, salt]);
    const { hash } = await wallet.sendTx({ to: FACTORY_V06, data });
    const rcpt = await wallet.rpc.waitReceipt(hash);
    const post = await wallet.rpc.call('eth_getCode', [account, 'latest']);
    return {
      ok: rcpt.status === '0x1' && post !== '0x',
      account,
      owner: wallet.address,
      txHash: hash,
      gasUsed: Number(rcpt.gasUsed),
      explorer: txLink(hash, network),
      accountExplorer: addrLink(account, network),
    };
  }
);

// ---------------------------------------------------------------- account_status
server.tool(
  'account_status',
  'Inspect a smart account: deployment status, owner, native balance, and EntryPoint deposit. Pass account address or owner+salt.',
  {
    type: 'object',
    properties: {
      account: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
      owner: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
      salt: { type: 'integer', minimum: 0 },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] },
    },
  },
  async ({ account, owner, salt = 0, network }) => {
    const rpc = rpcFor(network);
    if (!account) {
      if (!owner) return { ok: false, error: 'pass account or owner' };
      account = await predictedAddress(rpc, owner, salt);
    }
    const [code, bal] = await Promise.all([
      rpc.call('eth_getCode', [account, 'latest']),
      rpc.getBalance(account),
    ]);
    let accountOwner = null, epDeposit = null;
    if (code !== '0x') {
      try { accountOwner = abiDecode(['address'], await rpc.ethCall(account, encodeCall('owner()')))[0]; } catch {}
      try {
        const dep = await rpc.ethCall(ENTRYPOINT_V06, encodeCall('balanceOf(address)', [account]));
        epDeposit = formatUnits(abiDecode(['uint256'], dep)[0], 18);
      } catch {}
    }
    const net = getNetwork(network);
    return {
      ok: true,
      account: checksum(account),
      deployed: code !== '0x',
      owner: accountOwner,
      balance: `${formatUnits(bal, 18)} ${net.nativeToken}`,
      entryPointDeposit: epDeposit,
      explorer: addrLink(account, network),
    };
  }
);

// ---------------------------------------------------------------- build_batch
server.tool(
  'build_batch',
  'Encode a batch of calls into SimpleAccount.executeBatch calldata. Each call: {to, value?, data?}. Returns calldata you can pass to execute (mode="raw") or inspect. Enables one-transaction multi-step agent actions.',
  {
    type: 'object',
    properties: {
      calls: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            to: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
            value: { type: 'string', description: 'native amount in wei (default 0)' },
            data: { type: 'string', description: 'hex calldata (default 0x)' },
          },
          required: ['to'],
        },
        minItems: 1,
        maxItems: 50,
      },
    },
    required: ['calls'],
  },
  async ({ calls }) => {
    const dests = calls.map((c) => c.to);
    const values = calls.map((c) => BigInt(c.value ?? 0));
    const datas = calls.map((c) => c.data ?? '0x');
    // executeBatch(address[],uint256[],bytes[]) — v0.6 SimpleAccount (3-arg form: 0x47e1da2a)
    const types = ['address[]', 'uint256[]', 'bytes[]'];
    const encoded = bytesToHex(concat(selector('executeBatch(address[],uint256[],bytes[])'), abiEncode(types, [dests, values, datas])));
    return {
      ok: true,
      calldata: encoded,
      callCount: calls.length,
      totalValue: values.reduce((a, b) => a + b, 0n).toString(),
      note: 'Send this calldata TO the smart account address from the owner key (use execute with mode="raw").',
    };
  }
);

// ---------------------------------------------------------------- execute
server.tool(
  'execute',
  'Execute through the smart account as its owner. mode="single": call execute(dest,value,data). mode="batch": calls[] are encoded via executeBatch. mode="raw": send prebuilt calldata to the account. Owner key = PHAROS_PRIVATE_KEY.',
  {
    type: 'object',
    properties: {
      account: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
      mode: { type: 'string', enum: ['single', 'batch', 'raw'] },
      dest: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$', description: 'for single' },
      value: { type: 'string', description: 'wei, for single (default 0)' },
      data: { type: 'string', description: 'calldata for single, or raw calldata for raw' },
      calls: { type: 'array', description: 'for batch: [{to, value?, data?}]', items: { type: 'object' } },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] },
    },
    required: ['account', 'mode'],
  },
  async ({ account, mode, dest, value = '0', data = '0x', calls, network }) => {
    const wallet = walletFor(network);
    let calldata;
    if (mode === 'single') {
      if (!dest) return { ok: false, error: 'dest required for single' };
      calldata = bytesToHex(concat(selector('execute(address,uint256,bytes)'), abiEncode(['address', 'uint256', 'bytes'], [dest, BigInt(value), data])));
    } else if (mode === 'batch') {
      if (!calls?.length) return { ok: false, error: 'calls required for batch' };
      const dests = calls.map((c) => c.to);
      const values = calls.map((c) => BigInt(c.value ?? 0));
      const datas = calls.map((c) => c.data ?? '0x');
      // Detect account version: v0.6 SimpleAccount only has executeBatch(address[],bytes[])
      // (selector 18dfb3c7) and cannot carry per-call value; v0.7 adds the uint256[] form.
      let implCode = await wallet.rpc.call('eth_getCode', [account, 'latest']);
      if (!implCode.includes('47e1da2a') && !implCode.includes('18dfb3c7')) {
        // selectors not in direct code — likely an ERC-1967 proxy; read implementation slot
        const impl = await wallet.rpc.call('eth_getStorageAt', [account, '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc', 'latest']);
        const implAddr = '0x' + impl.slice(-40);
        if (!/^0x0+$/.test(impl)) implCode = await wallet.rpc.call('eth_getCode', [implAddr, 'latest']);
      }
      const hasV07Batch = implCode.includes('47e1da2a');
      const hasV06Batch = implCode.includes('18dfb3c7');
      if (hasV07Batch) {
        calldata = bytesToHex(concat(selector('executeBatch(address[],uint256[],bytes[])'), abiEncode(['address[]', 'uint256[]', 'bytes[]'], [dests, values, datas])));
      } else if (hasV06Batch) {
        if (values.some((v) => v !== 0n)) {
          return { ok: false, error: 'this account is SimpleAccount v0.6 — executeBatch cannot carry native value. Use value-less batch calls (e.g. token transfers) or mode:"single" per value transfer.' };
        }
        calldata = bytesToHex(concat(selector('executeBatch(address[],bytes[])'), abiEncode(['address[]', 'bytes[]'], [dests, datas])));
      } else {
        return { ok: false, error: 'account does not expose a known executeBatch — is it a SimpleAccount?' };
      }
    } else {
      if (!data || data === '0x') return { ok: false, error: 'data required for raw' };
      calldata = data;
    }
    const { hash } = await wallet.sendTx({ to: account, data: calldata });
    const rcpt = await wallet.rpc.waitReceipt(hash);
    return {
      ok: rcpt.status === '0x1',
      txHash: hash,
      gasUsed: Number(rcpt.gasUsed),
      logs: (rcpt.logs ?? []).length,
      explorer: txLink(hash, network),
      reverted: rcpt.status !== '0x1',
    };
  }
);

// ---------------------------------------------------------------- withdraw
server.tool(
  'withdraw',
  'Withdraw native PHRS/PROS from the smart account to a recipient (owner-signed execute with empty calldata).',
  {
    type: 'object',
    properties: {
      account: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
      to: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
      amount: { type: 'string', pattern: '^[0-9]+(\\.[0-9]+)?$', description: 'human units (e.g. "0.5")' },
      network: { type: 'string', enum: ['atlantic-testnet', 'mainnet'] },
    },
    required: ['account', 'to', 'amount'],
  },
  async ({ account, to, amount, network }) => {
    const wallet = walletFor(network);
    const wei = parseUnits(amount, 18);
    const calldata = bytesToHex(concat(selector('execute(address,uint256,bytes)'), abiEncode(['address', 'uint256', 'bytes'], [to, wei, '0x'])));
    const { hash } = await wallet.sendTx({ to: account, data: calldata });
    const rcpt = await wallet.rpc.waitReceipt(hash);
    return { ok: rcpt.status === '0x1', txHash: hash, explorer: txLink(hash, network) };
  }
);

server.start();
