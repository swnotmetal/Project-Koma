# Miko Claude Haiku alpha evaluation

Date: 2026-08-26; updated 2026-09-02

This record covers two narrow Claude Code behaviors. It does **not** establish
reliability for arbitrary tasks, hosts, models, or near-million-token contexts.

## Results

| Fixture | Skills | Approx. context | Result | Discovery/recovery | Turns | Cost |
| --- | ---: | ---: | --- | --- | ---: | ---: |
| Long-context baseline | 100 | 1k | pass | selected before checkpoint | 5 | $0.02168445 |
| Long-context smoke | 100 | 20k | pass | selected before checkpoint | 5 | $0.07064975 |
| Miko recovery | 1 | small | pass | `DENY → observed Skill → changed artifact` | 6 | $0.01929665 |
| Strict recovery v1 | 1 | small | scenario miss | proactively selected Skill; exact artifact and COMPLETE passed, but no DENY occurred | 6 | $0.02440525 |
| Strict recovery v2 | 1 | small | pass | `DENY → observed Skill → exact artifact → COMPLETE` | 7 | $0.02347050 |

Both 100-Skill passes applied the target Skill's marker rule and requested edit.
The 20k run reported 28,273 cache-creation input tokens, 99,005 cache-read input
tokens, 870 output tokens, and 36 uncached input tokens. The recovery run proved
that a real Claude Code session could react to a Miko denial, load the named
Skill, and retry the edit successfully.

All passing runs reported `promptOrCodePersistedByMiko: false`.

The 2026-09-01 rerun strengthened the harness before spending credits: the
fixture now has a Stop/COMPLETE obligation and fails unless the Skill marker,
entire artifact, completion decision, denial order, and ledger privacy all
match. In v1 the prompt named `frontend-design`, so Haiku sensibly loaded it
before editing and the recovery-specific assertion failed. This is retained as
a valid proactive-compliance observation and a failed recovery scenario, not a
Miko or model failure. V2 removed the leaked Skill name; the first Edit was
denied, Claude loaded the Skill from Miko's guidance, and every strengthened
assertion passed.

## Human CLI UX hand-tests

On 2026-09-01, the isolated `miko-claude-cli-lab` was exercised interactively
with Claude Code 2.1.202 and a Console API key against the published
`koma-miko@0.1.0-alpha.7` package. The visible sequence was:

1. Claude proposed `Edit`; Miko rendered a red PREPARE pause naming the missing
   `frontend-design` Skill and the automatic recovery action.
2. Claude loaded the named Skill without asking the user to move or inspect any
   files; Miko rendered a green PREPARE recovery receipt.
3. Claude read the target and retried the original edit.
4. The Stop Hook rendered a green COMPLETE receipt for one satisfied Agent Spec
   and six observed evidence events.

The resulting artifact exactly contained the required Skill marker and
`After Miko` heading. The local JSONL ledger contained the denial and observed
Skill, Read, and Edit metadata, but no prompt, source-code content, or tool
output. This validates the API-key CLI path and its user-visible recovery flow;
it does not validate Claude Desktop or subscription-only behavior.

### Natural-language, multi-file pass

Later on 2026-09-01, Claude Code 2.1.252 received one deliberately ordinary
Chinese request to make an unfinished page client-ready, usable on mobile, and
less visually noisy. The prompt did not name Miko, a Skill, a Hook, a command,
or any target file. In the isolated lab:

1. Miko denied Claude's first Bash discovery call because the lab's deliberately
   broad local-command Spec required `local-testing`.
2. Claude loaded `local-testing` and the relevant design, accessibility, and
   privacy Skills, then read the product brief and existing page files.
3. Claude rewrote `site/index.html`, `site/styles.css`, and `site/app.js`, fixed
   a classification edge case found during its own read-only checks, and left
   the unrelated component untouched.
4. The Stop Hook rendered `Miko verified · COMPLETE` for 3 Agent Specs and 28
   observed evidence events.

The final ledger contains Skill, reference, file-path, tool-success, and action
metadata but no prompt, source code, shell command, or tool output. The test also
exposed a lab-design warning: applying a Spec to every Bash call blocks harmless
file discovery and encourages eager Skill loading. Miko's default initializer
does not guard Bash this broadly; production Specs should target meaningful
boundaries rather than every exploratory command.

The exact Console charge for this manual session was not recorded, so it is not
included in the automated spend total below.

### Native REVIEW choice pass

On 2026-09-02, Claude Code 2.1.257 ran the same isolated lab with the page Spec
temporarily changed to `mode: "review"`. An ordinary Chinese request asked only
to make the headline and primary-button copy sound more natural.

Miko recorded `REVIEW / PREPARATION_EVIDENCE_MISSING`, and Claude opened its
native edit approval with `Yes`, session-wide edit approval, and `No`. Choosing
`No` prevented the edit but returned only Claude's generic user-rejection text;
the agent did not automatically follow Miko's recovery. Choosing `Yes` allowed
the edit before the missing Skills and product brief were loaded. Claude then
saw Miko's yellow context and loaded them after the fact. A two-call edit also
required two approvals.

The result validates Claude's `permissionDecision: ask` mapping, but rejects
approval-heavy missing-preparation prompts as the default vibe-coding UX. It
directly motivated `guided` mode: deterministic evidence gaps pause for agent
recovery, while genuinely judgment-dependent policy exceptions use native
user choice. No claim about Claude Desktop parity follows from this CLI test.

### Guided policy exception and hidden attribution

On 2026-09-02, the lab then used published `koma-miko@0.1.0-alpha.9` with
`mode: "guided"` and an ordinary Chinese request to improve a small product
page. Missing testing, design, accessibility, and reference evidence produced
red Miko pauses; Claude loaded the named materials and retried without user
intervention. The turn completed with 3 Agent Specs and 20 observed evidence
events.

A follow-up requested an edit to `src/components/Hero.tsx`, outside the Spec's
allowed client-page files. Miko recorded `REVIEW / PRE_ACTION /
PATH_OUT_OF_SCOPE`. Allowing the native prompt executed that one edit. A fresh
session requested an out-of-scope `package.json` edit; choosing No ended the
turn, left the package unchanged, and produced no PostToolUse edit evidence.
The safety and user-choice semantics therefore worked.

The attribution UX did not. With Claude's default Edit permission still active,
the CLI merged Miko's `ask` into a generic diff plus Yes/No dialog and displayed
neither Miko's name nor its supplied reason. A narrow `PermissionRequest`
companion hook emitted the intended `systemMessage` in offline hook replay but
the same Claude CLI did not render it during a live permission dialog. The
prototype was reverted rather than shipped. Enabling broad edit auto-approval
was then tested only inside the isolated lab with a catch-all write Spec. A No
decision still showed only Claude's generic rejection, so the permission
override was removed; it neither fixed pre-decision attribution nor provided an
acceptable onboarding workaround. The earlier visible yellow notice occurred
after an approved call returned Hook output to the transcript, not before the
user made the choice.

This run also exposed an evidence-language boundary: Claude claimed “complete
accessibility,” while the active Spec proved only that accessibility guidance
was loaded and selected artifacts changed. That statement is an unsupported
assertion, not verified accessibility. COMPLETE means the declared Agent Spec
obligations were observed; it must not be presented as general output quality
or Skill comprehension.

### Visible one-time review handshake

The attribution failure above was resolved in the next package candidate with
a bounded Claude CLI handshake rather than broad edit auto-approval. In two
real Claude Code 2.1.257 / Haiku 4.5 sessions, an out-of-scope `package.json`
edit first displayed Miko's yellow `PATH_OUT_OF_SCOPE` pause and then opened a
single `Miko review` question.

- `Keep current scope` produced a visible Miko receipt and no edit.
- `Allow once` approved only the exact fingerprinted retry, displayed `Miko
  allowed one exact exception`, performed the requested one-line edit, and
  ended with Miko COMPLETE.

The approval is consumed before the tool runs and a later identical action
requires a fresh decision. The ledger records request, decision, and
consumption metadata, but not the source text, prompt, or tool output. Raw
review-mode preparation gaps retain Claude's native approval limitation;
guided mode reserves this explicit handshake for policy exceptions.

## Harness correction retained as evidence

The first 20k attempt and a 1k diagnostic selected the correct Skill but did not
edit the file. Claude Code ended by requesting interactive write approval. Miko
had not denied the edit; the host's native permission check ran first. Those
runs cost $0.07959775 and $0.02110375 respectively and are **invalid as model or
Miko failures**.

The disposable runner now uses Claude Code's non-interactive bypass mode while
exposing only `Read`, `Edit`, and `Skill`; it provides no Bash or network tool.
This change is confined to eval fixtures and does not alter Miko's default
permissions or user projects.

Total Anthropic spend while creating and diagnosing this evaluation is now
$0.26020810. The two strengthened 2026-09-01 runs added $0.04787575; the clean
v2 recovery run cost $0.02347050.

## What remains unknown

- The 100k and 190k cases have not run.
- The test uses one synthetic UI task and one target Skill among simple decoys.
- Proactive Skill selection means the 20k run did not exercise Miko recovery;
  the separate one-Skill fixture covered recovery instead.
- `skill_loaded` proves the host observed a load. The marker assertion checks
  one visible rule, but neither proves general comprehension or long-term
  retention.
- No Sonnet or near-million-token result exists.
- The strengthened automated result and interactive hand-test both use the
  Claude CLI/API-key path. A Claude subscription-only Desktop surface is not
  inferred from Console API credits.
