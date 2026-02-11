# Upstream Tracking

MicroClaw is an independent fork of [NanoClaw](https://github.com/qwibitai/nanoclaw). This document tracks our relationship with upstream changes.

## Sync Status

| Field | Value |
|-------|-------|
| Upstream repo | https://github.com/qwibitai/nanoclaw |
| Up to date as of | `196abf67cfbe677e84b62106ca4fd9b38e81ff72` |
| Last sync check | 2026-02-10 |

## Upstream Commits

New commits on upstream `main` since our sync point. These are processed in order — when we merge one, we update "up to date as of" above and remove all commits up to and including the merged one from this table.

| Upstream SHA | Title | Status | Issue |
|-------------|-------|--------|-------|
| `2b56fecfdcfd` | Refactor index (#156) | TBD | [#55](https://github.com/cosmin/nanoclaw/issues/55) |

## Upstream Pull Requests (Open)

Open PRs upstream that we're tracking. When a PR is merged upstream, its changes will appear in the commits table above. When a PR is closed without merge, remove it from this table.

| PR # | Title | Status | Issue |
|------|-------|--------|-------|
| [#171](https://github.com/qwibitai/nanoclaw/pull/171) | security: sanitize env vars from agent Bash subprocesses | TBD | [#18](https://github.com/cosmin/nanoclaw/issues/18) |
| [#163](https://github.com/qwibitai/nanoclaw/pull/163) | feat: add proactive heartbeat system | TBD | [#22](https://github.com/cosmin/nanoclaw/issues/22) |
| [#160](https://github.com/qwibitai/nanoclaw/pull/160) | feat: support assistant having dedicated WhatsApp number | TBD | [#26](https://github.com/cosmin/nanoclaw/issues/26) |
| [#150](https://github.com/qwibitai/nanoclaw/pull/150) | fix security: add CPU and memory limits to agent containers | TBD | [#20](https://github.com/cosmin/nanoclaw/issues/20) |
| [#147](https://github.com/qwibitai/nanoclaw/pull/147) | feat: add Dropbox integration skill | TBD | [#32](https://github.com/cosmin/nanoclaw/issues/32) |
| [#146](https://github.com/qwibitai/nanoclaw/pull/146) | feat: add Google Workspace integration skill | TBD | [#38](https://github.com/cosmin/nanoclaw/issues/38) |
| [#145](https://github.com/qwibitai/nanoclaw/pull/145) | Add SECURITY.md reference to CLAUDE.md | TBD | [#23](https://github.com/cosmin/nanoclaw/issues/23) |
| [#144](https://github.com/qwibitai/nanoclaw/pull/144) | Fix: add retry logic to WhatsApp QR authentication network error | TBD | [#27](https://github.com/cosmin/nanoclaw/issues/27) |
| [#143](https://github.com/qwibitai/nanoclaw/pull/143) | Fix: Add reconnection logic to WhatsApp QR authentication | TBD | [#31](https://github.com/cosmin/nanoclaw/issues/31) |
| [#142](https://github.com/qwibitai/nanoclaw/pull/142) | Add /whatsapp-pairing-code skill for phone authentication | TBD | [#34](https://github.com/cosmin/nanoclaw/issues/34) |
| [#135](https://github.com/qwibitai/nanoclaw/pull/135) | Add SwarmHook skill for webhook infrastructure | TBD | [#45](https://github.com/cosmin/nanoclaw/issues/45) |
| [#129](https://github.com/qwibitai/nanoclaw/pull/129) | Refactor x-integration skill architecture | TBD | [#17](https://github.com/cosmin/nanoclaw/issues/17) |
| [#128](https://github.com/qwibitai/nanoclaw/pull/128) | feat: download and store WhatsApp media for agent access | TBD | [#53](https://github.com/cosmin/nanoclaw/issues/53) |
| [#125](https://github.com/qwibitai/nanoclaw/pull/125) | Add Docker Compose support and multi-channel architecture | TBD | [#59](https://github.com/cosmin/nanoclaw/issues/59) |
| [#124](https://github.com/qwibitai/nanoclaw/pull/124) | refactor: remove /workspace/ prefix from container mount paths | TBD | [#24](https://github.com/cosmin/nanoclaw/issues/24) |
| [#123](https://github.com/qwibitai/nanoclaw/pull/123) | docs: Add Telegram integration skill documentation | TBD | [#19](https://github.com/cosmin/nanoclaw/issues/19) |
| [#122](https://github.com/qwibitai/nanoclaw/pull/122) | docs: Add performance optimization skill documentation | TBD | [#21](https://github.com/cosmin/nanoclaw/issues/21) |
| [#121](https://github.com/qwibitai/nanoclaw/pull/121) | fix: skip empty messages from triggering agent responses | TBD | [#40](https://github.com/cosmin/nanoclaw/issues/40) |
| [#120](https://github.com/qwibitai/nanoclaw/pull/120) | fix: resolve container binary path for launchd compatibility | TBD | [#46](https://github.com/cosmin/nanoclaw/issues/46) |
| [#119](https://github.com/qwibitai/nanoclaw/pull/119) | fix: use valid browser fingerprint for WhatsApp connection | TBD | [#51](https://github.com/cosmin/nanoclaw/issues/51) |
| [#118](https://github.com/qwibitai/nanoclaw/pull/118) | fix: add DNS flag for Apple Container network resolution | TBD | [#56](https://github.com/cosmin/nanoclaw/issues/56) |
| [#117](https://github.com/qwibitai/nanoclaw/pull/117) | fix: use configurable assistant name instead of hardcoded 'Andy' | TBD | [#60](https://github.com/cosmin/nanoclaw/issues/60) |
| [#109](https://github.com/qwibitai/nanoclaw/pull/109) | Vps container environment multi bot | TBD | [#62](https://github.com/cosmin/nanoclaw/issues/62) |
| [#108](https://github.com/qwibitai/nanoclaw/pull/108) | simplify: extract IPC processing into src/ipc.ts | TBD | [#29](https://github.com/cosmin/nanoclaw/issues/29) |
| [#107](https://github.com/qwibitai/nanoclaw/pull/107) | simplify: consolidate magic numbers into config.ts | TBD | [#33](https://github.com/cosmin/nanoclaw/issues/33) |
| [#106](https://github.com/qwibitai/nanoclaw/pull/106) | fix: replace hardcoded /Users/user fallback with os.homedir() | TBD | [#37](https://github.com/cosmin/nanoclaw/issues/37) |
| [#105](https://github.com/qwibitai/nanoclaw/pull/105) | fix: use execFile instead of exec for osascript notification | TBD | [#42](https://github.com/cosmin/nanoclaw/issues/42) |
| [#104](https://github.com/qwibitai/nanoclaw/pull/104) | fix: replace `as any` casts with proper BoomError type | TBD | [#48](https://github.com/cosmin/nanoclaw/issues/48) |
| [#103](https://github.com/qwibitai/nanoclaw/pull/103) | Add logging and monitoring skill | TBD | [#25](https://github.com/cosmin/nanoclaw/issues/25) |
| [#102](https://github.com/qwibitai/nanoclaw/pull/102) | Add Notion integration skill | TBD | [#28](https://github.com/cosmin/nanoclaw/issues/28) |
| [#101](https://github.com/qwibitai/nanoclaw/pull/101) | Add GitHub integration skill | TBD | [#30](https://github.com/cosmin/nanoclaw/issues/30) |
| [#100](https://github.com/qwibitai/nanoclaw/pull/100) | Add image generation skill | TBD | [#36](https://github.com/cosmin/nanoclaw/issues/36) |
| [#99](https://github.com/qwibitai/nanoclaw/pull/99) | Add web search tool skill | TBD | [#41](https://github.com/cosmin/nanoclaw/issues/41) |
| [#98](https://github.com/qwibitai/nanoclaw/pull/98) | Add Slack channel skill | TBD | [#44](https://github.com/cosmin/nanoclaw/issues/44) |
| [#97](https://github.com/qwibitai/nanoclaw/pull/97) | Add Telegram channel skill | TBD | [#49](https://github.com/cosmin/nanoclaw/issues/49) |
| [#96](https://github.com/qwibitai/nanoclaw/pull/96) | Add browser automation skill | TBD | [#52](https://github.com/cosmin/nanoclaw/issues/52) |
| [#94](https://github.com/qwibitai/nanoclaw/pull/94) | feat: add linux and win32 supported | TBD | [#35](https://github.com/cosmin/nanoclaw/issues/35) |
| [#92](https://github.com/qwibitai/nanoclaw/pull/92) | Add Docker support and fix duplicate response bug | TBD | [#39](https://github.com/cosmin/nanoclaw/issues/39) |
| [#90](https://github.com/qwibitai/nanoclaw/pull/90) | Add Slack integration skill | TBD | [#43](https://github.com/cosmin/nanoclaw/issues/43) |
| [#84](https://github.com/qwibitai/nanoclaw/pull/84) | feat: Add Chinese README | TBD | [#47](https://github.com/cosmin/nanoclaw/issues/47) |
| [#81](https://github.com/qwibitai/nanoclaw/pull/81) | feat: add learn-from-clawhub skill | TBD | [#50](https://github.com/cosmin/nanoclaw/issues/50) |
| [#76](https://github.com/qwibitai/nanoclaw/pull/76) | feat: add proxy support for onboarding against GFW | TBD | [#54](https://github.com/cosmin/nanoclaw/issues/54) |
| [#75](https://github.com/qwibitai/nanoclaw/pull/75) | feat(skills): add Discord integration skill | TBD | [#58](https://github.com/cosmin/nanoclaw/issues/58) |
| [#73](https://github.com/qwibitai/nanoclaw/pull/73) | feat: add web search tool using Brave Search API | TBD | [#61](https://github.com/cosmin/nanoclaw/issues/61) |
| [#63](https://github.com/qwibitai/nanoclaw/pull/63) | feat: add WhatsApp auth retry | TBD | [#63](https://github.com/cosmin/nanoclaw/issues/63) |
| [#59](https://github.com/qwibitai/nanoclaw/pull/59) | prevent zombie child processes | TBD | [#57](https://github.com/cosmin/nanoclaw/issues/57) |
| [#55](https://github.com/qwibitai/nanoclaw/pull/55) | feat: add Linux with Docker/Podman runtime support | TBD | [#64](https://github.com/cosmin/nanoclaw/issues/64) |
| [#35](https://github.com/qwibitai/nanoclaw/pull/35) | Revert: Remove directory mounting feature | TBD | [#65](https://github.com/cosmin/nanoclaw/issues/65) |
| [#34](https://github.com/qwibitai/nanoclaw/pull/34) | feat: Add /add-telegram skill for Telegram channel support | TBD | [#66](https://github.com/cosmin/nanoclaw/issues/66) |
| [#27](https://github.com/qwibitai/nanoclaw/pull/27) | Add SwarmMarket.io skill for agent-to-agent trading | TBD | [#67](https://github.com/cosmin/nanoclaw/issues/67) |
| [#21](https://github.com/qwibitai/nanoclaw/pull/21) | Fix one-time scheduled tasks | TBD | [#68](https://github.com/cosmin/nanoclaw/issues/68) |
| [#19](https://github.com/qwibitai/nanoclaw/pull/19) | Use composite cursor for message pagination | TBD | [#69](https://github.com/cosmin/nanoclaw/issues/69) |

## Upstream Pull Requests (Closed Without Merge)

These PRs were closed upstream without being merged. Listed for completeness — no issues created.

<details>
<summary>Click to expand (26 PRs)</summary>

| PR # | Title |
|------|-------|
| [#170](https://github.com/qwibitai/nanoclaw/pull/170) | feat: add TTS announcements, HA skill, and voice integration docs |
| [#169](https://github.com/qwibitai/nanoclaw/pull/169) | feat: integrate ha-mcp into container agents for HA control |
| [#168](https://github.com/qwibitai/nanoclaw/pull/168) | feat: add HTTP API for external system integration |
| [#167](https://github.com/qwibitai/nanoclaw/pull/167) | feat: add ha-mcp sidecar for Home Assistant integration |
| [#166](https://github.com/qwibitai/nanoclaw/pull/166) | Revert: security/redact-secrets (#2) |
| [#165](https://github.com/qwibitai/nanoclaw/pull/165) | 1 |
| [#162](https://github.com/qwibitai/nanoclaw/pull/162) | feat: add proactive heartbeat system |
| [#161](https://github.com/qwibitai/nanoclaw/pull/161) | feat: migrate from Node.js to Bun runtime |
| [#159](https://github.com/qwibitai/nanoclaw/pull/159) | Update skills: Discord support, Docker migration, remove voice transcription |
| [#153](https://github.com/qwibitai/nanoclaw/pull/153) | Migrate from container-based to in-process Claude Agent SDK |
| [#151](https://github.com/qwibitai/nanoclaw/pull/151) | security: redact API keys from outgoing messages and logs |
| [#148](https://github.com/qwibitai/nanoclaw/pull/148) | CLAWD-28: Add Temporal CLI to Docker image with workflow catalog |
| [#141](https://github.com/qwibitai/nanoclaw/pull/141) | Telegram/Feishu support |
| [#140](https://github.com/qwibitai/nanoclaw/pull/140) | feat: auto-cleanup old Apple Container snapshots after build |
| [#139](https://github.com/qwibitai/nanoclaw/pull/139) | feat: expose additional env vars and mount GitHub CLI config in containers |
| [#134](https://github.com/qwibitai/nanoclaw/pull/134) | Add warm container pool |
| [#93](https://github.com/qwibitai/nanoclaw/pull/93) | feat: add /pr skill for pull request creation |
| [#91](https://github.com/qwibitai/nanoclaw/pull/91) | Add Docker support and fix duplicate response bug |
| [#86](https://github.com/qwibitai/nanoclaw/pull/86) | Telegram |
| [#82](https://github.com/qwibitai/nanoclaw/pull/82) | Pr 75 |
| [#78](https://github.com/qwibitai/nanoclaw/pull/78) | refactor(x-integration): Self-contained skill with managed dependencies |
| [#74](https://github.com/qwibitai/nanoclaw/pull/74) | docs(skills): add Discord integration skill |
| [#72](https://github.com/qwibitai/nanoclaw/pull/72) | CI: Test Supervisor Agent (Dry Run) |
| [#71](https://github.com/qwibitai/nanoclaw/pull/71) | fix: prevent duplicate responses from concurrent message processing |
| [#69](https://github.com/qwibitai/nanoclaw/pull/69) | Add admin commands, cost tracking, memory recall, and personalization |
| [#67](https://github.com/qwibitai/nanoclaw/pull/67) | Add telegram skill |
| [#66](https://github.com/qwibitai/nanoclaw/pull/66) | Add memory store v2, tool policies, metrics, daemon mode, and plugins |
| [#61](https://github.com/qwibitai/nanoclaw/pull/61) | chore: add WhatsApp auth retry logic and additional Anthropic env vars |
| [#58](https://github.com/qwibitai/nanoclaw/pull/58) | Fix container exit 1 3751746282079779989 |
| [#57](https://github.com/qwibitai/nanoclaw/pull/57) | fix: use composite cursor for message pagination |
| [#56](https://github.com/qwibitai/nanoclaw/pull/56) | fix: require UTC timestamps for one-time scheduled tasks |
| [#54](https://github.com/qwibitai/nanoclaw/pull/54) | refactor: deduplicate logger into shared module |
| [#53](https://github.com/qwibitai/nanoclaw/pull/53) | feat: Add /add-telegram skill for Telegram channel support |
| [#51](https://github.com/qwibitai/nanoclaw/pull/51) | Add X (Twitter) integration skill |
| [#50](https://github.com/qwibitai/nanoclaw/pull/50) | Add setup-token alternative for OAuth authentication in setup skill |
| [#49](https://github.com/qwibitai/nanoclaw/pull/49) | feat: add Docker runtime support for Linux |
| [#48](https://github.com/qwibitai/nanoclaw/pull/48) | feat: add /add-telegram skill |
| [#47](https://github.com/qwibitai/nanoclaw/pull/47) | refactor: deduplicate logger into shared module |
| [#46](https://github.com/qwibitai/nanoclaw/pull/46) | fix: use composite cursor for message pagination |
| [#45](https://github.com/qwibitai/nanoclaw/pull/45) | fix: enforce UTC for one-time scheduled tasks |
| [#44](https://github.com/qwibitai/nanoclaw/pull/44) | fix: add maxTurns limit to prevent agent loop |
| [#43](https://github.com/qwibitai/nanoclaw/pull/43) | update docs |
| [#42](https://github.com/qwibitai/nanoclaw/pull/42) | Claude/nanoclaw firecracker conversion 7g cr i |
| [#40](https://github.com/qwibitai/nanoclaw/pull/40) | Add Babashka migration plan document |
| [#37](https://github.com/qwibitai/nanoclaw/pull/37) | Rename to DotClaw and switch from WhatsApp to Telegram |
| [#36](https://github.com/qwibitai/nanoclaw/pull/36) | fix: add maxTurns limit to prevent agent loop runaway |
| [#33](https://github.com/qwibitai/nanoclaw/pull/33) | feat: Add /add-telegram skill for Telegram channel support |
| [#32](https://github.com/qwibitai/nanoclaw/pull/32) | feat: Add Discord and Telegram messaging channel skills |
| [#25](https://github.com/qwibitai/nanoclaw/pull/25) | Add Telegram channel support |
| [#24](https://github.com/qwibitai/nanoclaw/pull/24) | Add Linux with Docker runtime support alongside Apple Container |
| [#20](https://github.com/qwibitai/nanoclaw/pull/20) | Update README with correct github URLs |
| [#13](https://github.com/qwibitai/nanoclaw/pull/13) | Fix past one-time schedules creating zombie tasks |
| [#10](https://github.com/qwibitai/nanoclaw/pull/10) | Fix container JSON parsing with sentinel markers |
| [#8](https://github.com/qwibitai/nanoclaw/pull/8) | Add validation for cron/date/interval schedule values |
| [#6](https://github.com/qwibitai/nanoclaw/pull/6) | Replace IPC busy-loop polling with async fs.watch |
| [#5](https://github.com/qwibitai/nanoclaw/pull/5) | Fix cross-group scheduled tasks getting wrong chat_jid |
| [#4](https://github.com/qwibitai/nanoclaw/pull/4) | Fix task data leakage: isolate IPC directories per group |

</details>

---

## Maintenance Instructions

### How to run an upstream sync check

Future agents should follow this process to update UPSTREAM.md:

#### 1. Check for new upstream commits

```bash
git fetch upstream main
git log <UP_TO_DATE_SHA>..upstream/main --oneline --reverse
```

Add any new commits to the **Upstream Commits** table with status `TBD`.

#### 2. Check for new upstream PRs

```bash
gh pr list --repo qwibitai/nanoclaw --state open --json number,title,url -q '.[] | "\(.number)|\(.title)|\(.url)"'
```

Compare against the existing tables. Add any new PRs not already listed. Set status to `TBD`.

#### 3. Check for upstream PR state changes

```bash
gh pr list --repo qwibitai/nanoclaw --state all --json number,state -q '.[] | "\(.number)|\(.state)"'
```

If an open PR was merged or closed upstream, move it to the appropriate table section.

#### 4. Create issues for new TBD items

For each new `TBD` entry (PR or commit), create a GitHub issue:

```bash
gh issue create --title "[Upstream PR #N] Title" \
  --label "upstream-pr,upstream-tbd" \
  --body "$(cat <<'EOF'
## Upstream Reference
- PR: https://github.com/qwibitai/nanoclaw/pull/N
- Status upstream: OPEN/MERGED

## Summary
[What this PR does]

## Relevance to MicroClaw
[How this relates to our codebase — do we already have this? Different approach?]

## Recommendation
[ADOPT / ADAPT / SKIP — with reasoning]

## Implementation Notes
[If recommending ADOPT/ADAPT, capture relevant context for future implementation]
EOF
)"
```

For commits, use label `upstream-commit` instead of `upstream-pr`.

#### 5. Update status based on our issues

Check our issues tagged with `upstream-pr` or `upstream-commit`:

| Issue State | Has Merged PR? | UPSTREAM.md Status |
|-------------|---------------|-------------------|
| Open, labeled `upstream-tbd` | — | TBD |
| Open, labeled `upstream-todo` | — | TODO |
| Closed | Yes (merged) | MERGED |
| Closed | No | REJECTED |

```bash
# Check all upstream-tagged issues
gh issue list --label "upstream-pr" --state all --json number,title,state,labels
gh issue list --label "upstream-commit" --state all --json number,title,state,labels
```

#### 6. Clean up merged commits

When upstream commits are merged into MicroClaw:
1. Update "Up to date as of" to the new SHA
2. Remove all commits from the table up to and including the merged one
3. Keep the issue linked for history

#### Status values

| Status | Meaning |
|--------|---------|
| TBD | Not yet reviewed |
| TODO | Approved for implementation (issue labeled `upstream-todo`) |
| MERGED | Implemented in MicroClaw (issue closed with merged PR) |
| REJECTED | Decided not to implement (issue closed without merged PR) |

#### GitHub labels used

| Label | Purpose |
|-------|---------|
| `upstream-pr` | Issue tracks an upstream pull request |
| `upstream-commit` | Issue tracks an upstream commit |
| `upstream-tbd` | Not yet reviewed |
| `upstream-todo` | Approved for implementation |
