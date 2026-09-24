import { caseVerdicts, latestRuns, suiteStats } from "./db.ts"

export async function exportMarkdown(): Promise<string> {
  const runs = await latestRuns(5)
  const latest = runs[0]
  if (!latest) return "# BreakWall eval — no runs yet\n"
  const [suites, cases] = await Promise.all([
    suiteStats(latest.id),
    caseVerdicts(latest.id, { failedOnly: true, limit: 50 }),
  ])
  const gate = latest.passed ? "PASS" : "FAIL"
  const lines = [
    `# BreakWall eval — ${latest.model}`,
    "",
    `gate=${gate} (run \`${latest.id}\`, n=${latest.total})`,
    "",
    `ASR=${latest.asr ?? "—"} leakage=${latest.leakage ?? "—"} faithfulness=${latest.faithfulness ?? "—"} p95=${latest.p95Ms ?? "—"}ms cost/query=$${latest.costPerQuery ?? "—"}`,
    "",
    "| suite | total | failed |",
    "|---|---|---|",
    ...suites.map((s) => `| ${s.suite} | ${s.total} | ${s.failed} |`),
  ]
  if (cases.length > 0) {
    lines.push("", "## Failures", "")
    for (const c of cases) {
      lines.push(
        `- \`${c.caseId}\` [${c.suite}/${c.expected}]${c.leaked ? " LEAK" : ""}`,
      )
    }
  }
  return `${lines.join("\n")}\n`
}
