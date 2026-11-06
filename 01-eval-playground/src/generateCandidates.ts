import { readFile, writeFile } from "node:fs/promises";
import OpenAI from "openai";
import { config } from "./config.js";

const CV_PATH = "data/cv.md";
const OUTPUT_PATH = "data/candidates.json";

type Candidate = {
  id: string;
  flaw: string;
  text: string;
};

type Variant = {
  id: string;
  flaw: string;
  instruction: string;
};

const variants: Variant[] = [
  {
    id: "vague",
    flaw: "vague-generic",
    instruction:
      "Write a vague, generic summary. Avoid concrete numbers, technologies, or company names. " +
      "Lean on filler adjectives like 'dynamic', 'passionate', 'results-driven'. It should read " +
      "like it could apply to almost any engineering manager, while still being broadly true.",
  },
  {
    id: "overclaim",
    flaw: "over-claiming",
    instruction:
      "Write a summary that subtly over-claims scope and seniority beyond what the CV actually " +
      "supports. For example, imply department-wide strategy ownership, multi-team org design, or " +
      "executive-level influence, when the CV only documents managing one team of up to nine " +
      "engineers at a single company. Keep it plausible, not cartoonish.",
  },
  {
    id: "irrelevant",
    flaw: "irrelevant-heavy",
    instruction:
      "Write a summary that is factually accurate but foregrounds minor or outdated details " +
      "(e.g. early front-end work from 2010-2014, or general full-stack tasks) over the more " +
      "senior, relevant signal (fintech EM experience, regulated onboarding, team leadership) " +
      "that actually matters for an Engineering Manager role.",
  },
];

function buildPrompt(cvBody: string, instruction: string): string {
  return [
    "You are drafting a CV summary paragraph (3-5 sentences, ~60-120 words) based on the CV below.",
    "Do not copy the existing 'Profile' section verbatim — write a new paragraph.",
    "",
    instruction,
    "",
    "CV:",
    cvBody,
    "",
    "Return only the summary paragraph, no preamble, no quotes.",
  ].join("\n");
}

async function main() {
  const cvMarkdown = await readFile(CV_PATH, "utf-8");

  const profileMatch = cvMarkdown.match(
    /## Profile.*?\n\n([\s\S]*?)\n\n## Employment History/
  );
  if (!profileMatch) throw new Error("Could not extract existing Profile section from cv.md");
  const realProfile = profileMatch[1].trim();

  const cvBody = cvMarkdown.replace(/## Profile[\s\S]*?\n\n(?=## Employment History)/, "");

  const openai = new OpenAI({ apiKey: config.openaiApiKey });

  const candidates: Candidate[] = [{ id: "real", flaw: "none", text: realProfile }];

  for (const variant of variants) {
    const response = await openai.chat.completions.create({
      model: config.generatorModel,
      messages: [{ role: "user", content: buildPrompt(cvBody, variant.instruction) }],
      temperature: 0.7,
    });
    const text = response.choices[0]?.message?.content?.trim();
    if (!text) throw new Error(`Empty generation for variant ${variant.id}`);
    candidates.push({ id: variant.id, flaw: variant.flaw, text });
    console.log(`Generated "${variant.id}":\n${text}\n`);
  }

  await writeFile(OUTPUT_PATH, JSON.stringify(candidates, null, 2));
  console.log(`Wrote ${candidates.length} candidates to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
