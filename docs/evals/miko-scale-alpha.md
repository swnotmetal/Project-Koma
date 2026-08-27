# Miko verifier scale reference

Date: 2026-08-27

This is a local deterministic verifier-cost reference, not a model benchmark or
a cross-machine latency promise.

## Environment

- Windows NT 10.0.26200.0, x64
- Node.js 24.19.0
- AMD64 Family 25 Model 33
- `koma-miko` 0.1.0-alpha.4 source tree

## Command

```sh
npm run eval:scale -w koma-miko
```

The runner performs up to 25 warm-up calls, measures each operation with
`performance.now()`, sorts the samples, and reports p50/p95. It also asserts
that the rendered denial stays bounded when 100 Agent Specs overlap.

## Result

| Scenario | Specs | Evidence | Iterations | p50 | p95 |
|---|---:|---:|---:|---:|---:|
| One matching spec among 100 | 100 | 1 | 2,000 | 0.1059 ms | 0.2011 ms |
| One matching spec among 1,000 | 1,000 | 1 | 500 | 1.1001 ms | 1.3426 ms |
| 100 overlapping specs | 100 | 0 | 1,000 | 0.1058 ms | 0.2355 ms |
| Lookup with 10,001 indexed evidence events | 1 | 10,001 | 1,000 | 0.0024 ms | 0.0041 ms |
| Restore snapshot with 1,000 evidence events | 100 | 1,000 | 100 | 1.1922 ms | 1.5165 ms |

The process-wide heap delta observed during this run was 17.19 MiB. That value
is GC-sensitive and should not be treated as a package memory guarantee.

## Boundaries

- This measures in-process TypeScript verification and snapshot restore. It
  excludes host process startup, JSONL filesystem I/O, editor UI, and model
  latency.
- Context text and model tokens are not ingested by Miko. Long-context model
  behavior requires a separate live evaluation.
- Results will vary by machine and Node version. The executable runner and its
  assertions are the artifact; this table is one dated reference run.
