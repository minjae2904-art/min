// Round E guard (spec 8.1): no Thai character in shipped code outside the th side of src/i18n/msg, except literals marked
// `// i18n-allow: <reason>` on the same line or the line directly above (Thai-detection regexes on user input,
// legacy-value matching, endonyms). Comments are never scanned (not shipped). TypeScript AST, so strings, templates,
// JSX text and regex literals are all covered.
// Strict mode for one batch: I18N_FILES=src/lib/templates.ts,src/i18n/msg/lib-1.ts npx vitest run src/lib/__tests__/i18n-guard.test.ts
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const THAI = /[\u0E00-\u0E7F]/;
const MARK = /\/\/\s*i18n-allow:(.*)$/;

// Files not migrated yet: skipped in default mode. Round E: emptied at integration (every file is migrated).
const TEMP_ALLOW = new Set<string>([]);

type Hit = { line: number; text: string };
const kinds = new Set([ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral, ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail, ts.SyntaxKind.JsxText, ts.SyntaxKind.RegularExpressionLiteral]);

// Violations in one file (repo-relative path, forward slashes).
export function scan(rel: string): string[] {
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lineOf = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  // Dictionary modules: Thai only inside the initializer of `export const th`.
  let thRange: [number, number] | null = null;
  if (rel.startsWith("src/i18n/msg/")) for (const st of sf.statements) {
    if (!ts.isVariableStatement(st) || !st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === "th" && d.initializer) thRange = [d.initializer.getStart(sf), d.initializer.end];
  }
  const hits: Hit[] = [];
  const walk = (n: ts.Node) => {
    if (kinds.has(n.kind)) {
      const raw = n.getText(sf);
      if (THAI.test(raw) && !(thRange && n.getStart(sf) >= thRange[0] && n.end <= thRange[1])) hits.push({ line: lineOf(n.getStart(sf)), text: raw.trim().replace(/\s+/g, " ").slice(0, 100) });
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  // Markers: the line itself and the next one.
  const lines = text.split(/\r?\n/), out: string[] = [];
  const marks = new Map<number, string>();
  lines.forEach((l, i) => { const m = MARK.exec(l); if (m) marks.set(i + 1, m[1].trim()); });
  const used = new Set<number>();
  for (const h of hits) {
    const at = marks.has(h.line) ? h.line : marks.has(h.line - 1) ? h.line - 1 : 0;
    if (at && marks.get(at)!.length >= 3) { used.add(at); continue; }
    out.push(`${rel}:${h.line}: ${h.text}`);
  }
  for (const [l, reason] of marks) {
    if (reason.length < 3) out.push(`${rel}:${l}: i18n-allow marker needs a reason (at least 3 chars)`);
    else if (!used.has(l)) out.push(`${rel}:${l}: i18n-allow marker covers no Thai literal`);
  }
  return out;
}

function sources(): string[] {
  return (fs.readdirSync(path.join(ROOT, "src"), { recursive: true }) as string[])
    .map((f) => "src/" + f.split(path.sep).join("/"))
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("/__tests__/"))
    .sort();
}

describe("i18n guard", () => {
  const only = process.env.I18N_FILES?.split(",").map((f) => f.trim().split(path.sep).join("/")).filter(Boolean);
  it(only ? `strict: ${only.join(", ")}` : "no Thai outside dictionaries and marked literals", () => {
    const files = only ?? sources().filter((f) => !TEMP_ALLOW.has(f));
    const bad = files.flatMap(scan);
    expect(bad, bad.join("\n")).toEqual([]);
  });
  it("every TEMP_ALLOW path exists", () => {
    const missing = [...TEMP_ALLOW].filter((f) => !fs.existsSync(path.join(ROOT, f)));
    expect(missing).toEqual([]);
  });
});
