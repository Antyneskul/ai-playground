# Eval Playground — Progress Report

**Status: build phase complete.** All planned scripts (`generateCandidates.ts`,
`factCheck.ts`, `judge.ts`, `compare.ts`) are built, typechecked, and have
been run against the real CV, the six candidate pairs, and the saved human
preferences. Results are below.

## Goal

Compare a human's pairwise preference between CV summary candidates against an
LLM judge's preference, scored on factual accuracy, relevance, and
specificity. Primary question: does the LLM judge agree with the human, and
does swapping candidate order (A,B vs B,A) flip the judge's verdict
(position bias). Standalone, script-based, no UI, no production
infrastructure. Scope: 2-3 evenings.

## What exists

```
01-eval-playground/
├── package.json          @anthropic-ai/sdk, openai, dotenv, typescript, tsx
├── tsconfig.json          NodeNext, strict
├── .env                    ANTHROPIC_API_KEY, OPENAI_API_KEY (gitignored, not in git)
├── data/
│   ├── cv.md               real CV (Oleksandr Antyneskul, EM variant), profile + employment history + skills
│   ├── candidates.json     4 candidate summaries (see below)
│   └── factchecks.json     per-candidate claim-level fact-check output
└── src/
    ├── config.ts           env loading, model ids
    ├── generateCandidates.ts   generates 3 flawed candidates via OpenAI (gpt-4o-mini)
    └── factCheck.ts         claim-level fact-check per candidate via Claude (claude-haiku-5-5)
```

Not yet built: pairwise judge (A/B comparison + ordering swap), human blind-pick
capture, comparison/scoring script.

## Candidates

4 candidates per the real CV, generated once and stored (not regenerated per
run):

| id | flaw (designed) | source |
|---|---|---|
| `real` | none | existing human-written Profile paragraph, verbatim |
| `vague` | vague / generic, no concrete numbers or tech | generated |
| `overclaim` | subtly inflates scope/seniority beyond CV support | generated |
| `irrelevant` | accurate, but foregrounds minor/outdated details over senior fintech/EM signal | generated |

4 candidates → 6 unique pairs for the pairwise comparison stage.

## Fact-check pass (completed, separate from pairwise judging)

Decided to keep claim-level fact-checking as an independent, non-pairwise
signal: run once per candidate (not per pair, not per ordering), splits the
summary into atomic claims and checks each against the CV body (Profile
section excluded from the reference CV to avoid circularity — see below).
Uses Claude's tool-calling for structured output. Purpose: a secondary,
order-independent accuracy signal to sanity-check whatever the pairwise
judge later says about "factual accuracy."

Latest run (`data/factchecks.json`):

| candidate | supported / total |
|---|---|
| real | 5/5 |
| vague | 5/8 |
| overclaim | 5-6/9 (varies, see below) |
| irrelevant | 8/11 |

Directionally sensible: `real` scores highest, `overclaim` lowest on
accuracy, `irrelevant` scores high on accuracy (correctly — its flaw is
relevance, not accuracy, and this checker only measures accuracy).

## Issues found and fixed along the way

1. **Date-arithmetic bug**: judge initially rejected "16+ years in software
   development" reasoning the earliest role (2010) was "about 15 years
   before the present" — wrong arithmetic, and the model has no notion of
   today's actual date. Fixed by injecting today's date into the prompt.
   Worth keeping as a general lesson: judge models can be wrong about
   recency/duration independent of the CV's actual accuracy, unless given
   the current date explicitly.
2. **Circularity bug**: the `real` candidate was originally fact-checked
   against a CV that contained its own text verbatim in the Profile
   section, giving it an unearned accuracy advantage over generated
   candidates. Fixed by excluding the Profile section from the reference CV
   used in fact-checking, so all 4 candidates are checked against the same
   underlying facts (employment history, skills, education).
3. **No `temperature` control on `claude-haiku-5-5`**: the API rejects
   `temperature` as deprecated for this model. Determinism isn't available
   this way. Observed variance without it: claim *decomposition* (how many
   atomic claims get extracted) is now stable across repeat runs post-fix,
   but individual supported/unsupported calls on borderline claims can
   still flip by one. Decision: accept as a documented limitation rather
   than add retry/majority-vote logic, which would be disproportionate
   engineering for a secondary signal in a 2-3 evening lab.
4. **Self-contradicting verdict, caught by adding a `gap` field**: added a
   required `gap` field to the fact-checker (null when supported; for
   unsupported claims, what evidence would be needed, or a note that the
   CV contradicts the claim rather than just lacking evidence for it). On
   one run, the "16+ years in software development" claim was marked
   `supported: false`, but its own `gap` text read "Actually the duration
   is supported by the Aug 2010 start date; no correction needed" —
   directly contradicting the verdict. The `gap` field made an
   already-existing inconsistency auditable; without it, this would have
   shown up only as an unexplained flip in the raw true/false count. This
   is the same claim affected by the earlier date-arithmetic bug,
   suggesting the judge is specifically unstable on this one claim across
   runs. Logged as a finding, not fixed with added logic (e.g. a
   consistency check between `supported` and `gap`) — kept in scope as
   something to report, not engineer around.

## Open architectural decision

Order of the next two steps — not yet decided:

- **(a) Human blind pick first**: show the 6 pairs unlabeled (no hint which
  is `real` vs generated) and record the human's preference before the LLM
  judge exists, so the human baseline can't be influenced by having seen
  judge output first.
- **(b) Build `judge.ts` first**: the pairwise comparison + A/B-ordering-swap
  script (the core of the experiment), then do the human blind pick
  afterward.

Judge model decided: `claude-haiku-5-5` (cheapest in the Claude 5 family),
kept distinct from the `gpt-4o-mini` generator model specifically to avoid
self-preference bias (a model favoring its own writing style when judging).

## Final results

Source data: `data/human-preferences.csv` (your blind picks), `data/judgments.json`
(12 judge calls — 6 pairs × 2 orderings), `data/comparison.json` (computed by
`compare.ts`, no new model calls).

### Ordering stability

5 of 6 pairs (83%) kept the **same winner** when the candidates were swapped
between slots A and B. Only `real-overclaim` flipped.

### Agreement with human preference

Two different metrics, reported separately because they answer different
questions:

- **Pair-level, stable pairs only**: of the 5 pairs where the judge gave the
  same winner regardless of order, it agreed with your pick on **4 of 5
  (80%)**. The 6th pair (`real-overclaim`) is excluded from this metric since
  it has no single stable verdict to compare.
- **Call-level, across all 6 pairs (12 calls)**: counting every individual
  call against the human pick for its pair (so the order-dependent pair
  contributes one match and one mismatch rather than being excluded),
  **9 of 12 calls (75%)** matched the human pick. This is agreement across
  calls covering six pairs, not a second, independent pair-level agreement
  rate — the lower number is mechanically explained by including
  `real-overclaim`'s split verdict rather than excluding it.

### real vs. overclaim — the order-dependent pair

Whichever candidate was placed in **slot B won, in both orderings**
(A=real→B=overclaim wins; A=overclaim→B=real wins). This is an observation
consistent with position bias. Note: human blinding broke on this specific
pair — candidate identities were inadvertently revealed before the human
pick was recorded (see the note in `data/human-preferences.csv`), so the
human preference for this pair isn't usable as a clean blind baseline
regardless of the judge's order-sensitivity.

### vague vs. irrelevant — the one real disagreement

The judge agreed with itself across both orderings here (`irrelevant` won
both times), but disagreed with the human, who preferred `vague`. Laying
the rationales side by side, referenced against the saved Shine Senior EM
job description:

- **Human** (from `data/human-preferences.csv`): deciding criterion was
  **relevance**, specifically recency — `irrelevant`'s "since 2010" and
  named older stack (Angular) read as dated relative to what the Senior EM
  posting asks for, even though the human's own specificity note conceded
  `irrelevant` had more concrete anchors than `vague`. The relevance penalty
  for datedness outweighed the specificity gap in the human's overall call.
- **Judge, both orderings** (from `data/judgments.json`): deciding criterion
  was **specificity / CV-traceable groundedness** — both verdicts open with
  "more specific" / "more specific and grounded in verifiable CV content" as
  the lead reason. The judge's own text acknowledges a relevance point in
  `vague`'s favor in the reversed-order call ("Candidate B is
  more management-oriented, which is relevant to the Senior EM role") but
  resolves toward specificity anyway.

So the deciding criterion is identifiable on both sides, and they're
different: the human weighted relevance (role-fit/recency) above
specificity; the judge weighted specificity/groundedness above a relevance
point it explicitly noticed in the human's preferred candidate. This reads
as a genuine criteria-weighting disagreement rather than noise, and is left
open for review rather than resolved — there's no saved data that says
which weighting is "correct," only that they differ.
