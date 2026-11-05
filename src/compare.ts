import { readFile, writeFile } from "node:fs/promises";

const HUMAN_PATH = "data/human-preferences.csv";
const JUDGMENTS_PATH = "data/judgments.json";
const OUTPUT_PATH = "data/comparison.json";

type HumanPref = {
  pairId: string;
  candidateAId: string;
  candidateBId: string;
  preferredId: string;
};

type JudgmentResult = {
  pairId: string;
  candidateAId: string;
  candidateBId: string;
  rawPreferred: "A" | "B" | "tie";
  preferredCandidateId: string;
};

type JudgmentsFile = {
  model: string;
  rubric: string;
  runTimestamp: string;
  results: JudgmentResult[];
};

type Agreement = "agree" | "disagree" | "order-dependent" | "human-tie" | "unscored";

type PairComparison = {
  pairId: string;
  humanPreferredId: string;
  judgeStable: boolean;
  judgeOrientation1Winner: string;
  judgeOrientation2Winner: string;
  judgeWinnerIfStable: string | null;
  agreement: Agreement;
};

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

async function loadHumanPreferences(): Promise<HumanPref[]> {
  const raw = await readFile(HUMAN_PATH, "utf-8");
  const lines = raw.trim().split("\n");
  const [, ...rows] = lines;
  return rows.map((line) => {
    const [pairId, candidateAId, candidateBId, preferredId] = parseCsvLine(line);
    return { pairId, candidateAId, candidateBId, preferredId };
  });
}

async function main() {
  const humanPrefs = await loadHumanPreferences();
  const judgments: JudgmentsFile = JSON.parse(await readFile(JUDGMENTS_PATH, "utf-8"));

  const byPair = new Map<string, JudgmentResult[]>();
  for (const r of judgments.results) {
    const list = byPair.get(r.pairId) ?? [];
    list.push(r);
    byPair.set(r.pairId, list);
  }

  const comparisons: PairComparison[] = [];

  for (const human of humanPrefs) {
    const judgeResults = byPair.get(human.pairId);
    if (!judgeResults || judgeResults.length !== 2) {
      throw new Error(
        `Expected 2 judge results for pair ${human.pairId}, got ${judgeResults?.length ?? 0}`
      );
    }
    const [r1, r2] = judgeResults;
    const judgeStable = r1.preferredCandidateId === r2.preferredCandidateId;

    let agreement: Agreement;
    if (!human.preferredId) {
      agreement = "unscored";
    } else if (!judgeStable) {
      agreement = "order-dependent";
    } else if (human.preferredId === "tie") {
      agreement = "human-tie";
    } else {
      agreement = human.preferredId === r1.preferredCandidateId ? "agree" : "disagree";
    }

    comparisons.push({
      pairId: human.pairId,
      humanPreferredId: human.preferredId || "(blank)",
      judgeStable,
      judgeOrientation1Winner: r1.preferredCandidateId,
      judgeOrientation2Winner: r2.preferredCandidateId,
      judgeWinnerIfStable: judgeStable ? r1.preferredCandidateId : null,
      agreement,
    });
  }

  const stablePairs = comparisons.filter((c) => c.judgeStable);
  const scorablePairs = stablePairs.filter(
    (c) => c.agreement === "agree" || c.agreement === "disagree"
  );
  const agreeCount = scorablePairs.filter((c) => c.agreement === "agree").length;

  console.log("pair_id              | human     | judge (1st-slot, 2nd-slot winners) | stable | agreement");
  for (const c of comparisons) {
    console.log(
      `${c.pairId.padEnd(20)} | ${c.humanPreferredId.padEnd(9)} | ${c.judgeOrientation1Winner}, ${c.judgeOrientation2Winner}`.padEnd(60) +
        ` | ${String(c.judgeStable).padEnd(6)} | ${c.agreement}`
    );
  }

  const summary = {
    totalPairs: comparisons.length,
    stablePairs: stablePairs.length,
    orderDependentPairs: comparisons.length - stablePairs.length,
    scorablePairs: scorablePairs.length,
    agreementCount: agreeCount,
    agreementRate: scorablePairs.length > 0 ? agreeCount / scorablePairs.length : null,
  };

  console.log("\nSummary:", summary);

  await writeFile(OUTPUT_PATH, JSON.stringify({ comparisons, summary }, null, 2));
  console.log(`Wrote comparison to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
