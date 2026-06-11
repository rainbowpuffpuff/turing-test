# Install Proof — `npx skills add rainbowpuffpuff/turing-test`

Recorded 2026-06-11 from a clean directory. This is the **same install
mechanism Byreal documents for their own agent skills**
(`npx skills add byreal-git/byreal-perps-cli` — see Byreal Perps Agent Skills → Installation).
ClawKit skills therefore install side-by-side with Byreal's skills into any
RealClaw/OpenClaw-compatible agent — the documented Mantle integration path:
"extend RealClaw with Mantle-compatible Skills."

## Result: 11 skills installed for 19 agents (+47 via symlink)

```text
, Autohand Code CLI, Augment, IBM Bob +47 more  │
│                                                                                │
│  ./.agents/skills/pharos-x402-buyer                                            │
│    universal: Amp, Antigravity, Antigravity CLI, Cline, Codex +14 more         │
│    symlink → AiderDesk, AstrBot, Autohand Code CLI, Augment, IBM Bob +47 more  │
│                                                                                │
│  ./.agents/skills/pharos-x402-merchant                                         │
│    universal: Amp, Antigravity, Antigravity CLI, Cline, Codex +14 more         │
│    symlink → AiderDesk, AstrBot, Autohand Code CLI, Augment, IBM Bob +47 more  │
│                                                                                │
├────────────────────────────────────────────────────────────────────────────────╯
│
│
◇  Installed 11 skills ───────────────────────────────────────────────────╮
│                                                                         │
│  ✓ ./.agents/skills/clawkit                                             │
│    universal: Amp, Antigravity, Antigravity CLI, Cline, Codex +14 more  │
│  ✓ ./.agents/skills/pharos-agent-escrow                                 │
│    universal: Amp, Antigravity, Antigravity CLI, Cline, Codex +14 more  │
│  ✓ ./.agents/skills/pharos-agent-registry                               │
│    universal: Amp, Antigravity, Antigravity CLI, Cline, Codex +14 more  │
│  ✓ ./.agents/skills/pharos-chain-sentinel                               │
│    universal: Amp, Antigravity, Antigravity CLI, Cline, Codex +14 more  │
│  ✓ ./.agents/skills/pharos-invoice-book                                 │
│    universal: Amp, Antigravity, Antigravity CLI, Cline, Codex +14 more  │
│  ✓ ./.agents/skills/pharos-payroll-batch                                │
│    universal: Amp, Antigravity, Antigravity CLI, Cline, Codex +14 more  │
│  ✓ ./.agents/skills/pharos-smart-account                                │
│    universal: Amp, Antigravity, Antigravity CLI, Cline, Codex +14 more  │
│  ✓ ./.agents/skills/pharos-stream-pay                                   │
│    universal: Amp, Antigravity, Antigravity CLI, Cline, Codex +14 more  │
│  ✓ ./.agents/skills/pharos-token-launcher                               │
│    universal: Amp, Antigravity, Antigravity CLI, Cline, Codex +14 more  │
│  ✓ ./.agents/skills/pharos-x402-buyer                                   │
│    universal: Amp, Antigravity, Antigravity CLI, Cline, Codex +14 more  │
│  ✓ ./.agents/skills/pharos-x402-merchant                                │
│    universal: Amp, Antigravity, Antigravity CLI, Cline, Codex +14 more  │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────╯
│
└  Done!  Review skills before use; they run with full agent permissions.
Script done on 2026-06-11 16:21:51+02:00 [COMMAND_EXIT_CODE="0"]
```

## Installed skills run as-is (zero npm dependencies)

```text
$ node .agents/skills/pharos-agent-escrow/src/server.mjs   # from the INSTALL location
INSTALLED SKILL RUNS: pharos-agent-escrow — 10 tools exposed
```

Every skill is a self-contained MCP stdio server: no `npm install` step exists, so the
installed tree is immediately runnable by any agent runtime that discovered it.
