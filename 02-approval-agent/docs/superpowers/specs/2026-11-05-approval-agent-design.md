# Draft / Review / Approve / Execute Agent — Design

## Intent & why

A standalone mini-lab (2-3 evenings) to build hands-on understanding of
**human-in-the-loop agent state**: what must be persisted so a review
step can pause indefinitely, survive the process exiting (or the
machine restarting), and resume correctly later.

This is a learning exercise about state and resumability, not about
draft quality or real-world integration. The "message" and "execution"
are stand-ins; the interesting part is the state machine underneath.

Collaboration mode: Claude writes the code, the human partner (a Staff
Engineer / former EM) makes the architectural calls. Work proceeds in
small, reviewable increments — one practical step at a time, not a full
plan or full implementation dropped at once.

## Goals

- A CLI tool (TypeScript / Node) with no long-running process and no
  blocking prompt. Every invocation is a fresh process: read state from
  disk, do one thing, write state back, exit.
- A durable on-disk state file that fully describes every item's
  position in its lifecycle (pending review → approved / rejected →
  executed — `draft` writes a new item directly into `pending_review`;
  there's no separate idle "drafted" state before review), so a fresh
  process can always reconstruct what to do next without any in-memory
  context from a prior run.
- A clean demonstration of restart-safety: kill the process (or
  simulate a reboot) between any two steps, and the next command
  behaves correctly.
- Execution is simulated by appending an entry to a local, append-only
  log file — standing in for "the real action" (e.g. actually sending a
  message).

## Non-goals

- No integration with the AI Lab project or any other existing system.
- No UI (web or TUI) — command-line only.
- No real external side effect (no actual Slack/email/API send). The
  local log file *is* the execution record.
- No production concerns: no auth, no multi-user support, no
  concurrent-writer safety, no retry/queueing infrastructure.
- No requirement that the draft content be good or LLM-generated — a
  simple template is enough unless the builder decides an LLM call adds
  clearer learning value.

## Anti-goals (would count as failure even if "it runs")

- A design that only works if the same process stays alive from draft
  to execution (i.e. anything that secretly depends on in-memory state
  and would break if you `Ctrl+C`'d and restarted).
- A blocking CLI prompt (`readline` waiting on stdin) standing in for
  "review" — explicitly rejected in favor of an async, walk-away-and-
  come-back flow.

## Constraints

- TypeScript + Node, run via `tsx` (no build step), matching the
  conventions already used in the sibling project `01-eval-playground`
  (`"type": "module"`, `tsc --noEmit` for typechecking).
- Own standalone git repo at `ai-mini-labs/02-approval-agent`, no
  dependency on `01-eval-playground`.

## Decided architecture

A single CLI entrypoint with subcommands, each a complete, independent
process invocation:

- `draft` — generates a short message, writes it to the state file as
  a new item in `pending_review` status, exits.
- `list` — reads the state file, prints all items and their status.
  Safe to run at any time, changes nothing.
- `approve <id>` / `reject <id>` — reads the state file, finds the item,
  updates its status (`approved` or `rejected`), writes the state file
  back, exits.
- `run` — reads the state file, finds every `approved` item not yet
  executed, performs the simulated execution (appends a line to the
  local log file), marks the item `executed` in the state file, exits.

State lives entirely in a JSON file on disk — not in memory, not in any
open connection — so that *any* of the above commands can be the first
thing run after a process restart, and correctness depends only on what
was last written to disk.

Transition guards: `approve`/`reject` only act on an item currently in
`pending_review`; `run` only acts on items currently `approved` and not
yet executed. Calling a command against an item in the wrong state is a
rejected, visible error — never a silent no-op or overwrite. The state
machine's integrity is the subject of this lab, so invalid transitions
should fail loudly.

Demonstrating restart-safety is done manually: run the commands across
separate shell sessions (and literally restart the machine at least
once across the 2-3 evenings), inspecting the state file and log
between steps. No automated kill-signal test harness is in scope —
consistent with the non-goals around production-grade reliability
tooling.

Process note: the build is planned as a full ordered step list (so
there's a map of where this is going), but implemented and reviewed in
small increments — pausing at each logical checkpoint for review before
moving to the next — rather than delivered as one finished drop.

## Left to the builder (first practical step)

- Exact state file schema (fields per item, on-disk location, ID
  scheme).
- Where the simulated execution log lives and its format.
- What the `draft` command's placeholder message generation looks like
  (static template vs. something more elaborate) — not load-bearing for
  the lab's learning goal.
- Whether `run` is its own command or folds into `approve` — current
  design keeps them separate so "approval" and "execution" stay visibly
  distinct steps, but this is open to revisit.
