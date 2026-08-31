# Miko Claude Haiku alpha evaluation

Date: 2026-08-26; updated 2026-09-01

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
- The strengthened result is a non-interactive Claude CLI/API-key fixture.
  Human CLI UX remains a separate hand-test; a Claude subscription-only Desktop
  surface is not inferred from Console API credits.
