// Round E th-check (spec 8.4): proves the th dictionary values are the ORIGINAL Thai, byte for byte.
// Usage: node scripts/i18n-th-check.mjs <source files...> <dictionary modules (src/i18n/msg/*.ts)...>
// Units come from `git show HEAD:<file>`: Thai string literals and no-substitution templates (cooked text), templates
// (each ${...} = a slot), JSX children runs (React whitespace rules; expressions and child elements = slots; each Thai
// text piece is also a sub-unit) and regex literals (source). th values are normalized the same way ({...} = a slot).
// Forward (old -> new): exact match OK, or the literal is still in the current file under an i18n-allow marker;
// split JSX run / substring-only = WARNING; anything else = ERROR. Reverse (new -> old): a Thai piece of a th value in
// the given modules (not common/fmt) that appears in no unit = ERROR. Exit 1 on any ERROR.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const THAI = /[฀-๿]/;
const SLOT = "";
const ALWAYS = ["src/i18n/msg/common.ts", "src/i18n/msg/fmt.ts"];
const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const rel = (f) => path.relative(ROOT, path.resolve(f)).split(path.sep).join("/");

const args = process.argv.slice(2).map(rel);
const mods = args.filter((f) => f.startsWith("src/i18n/msg/"));
const srcs = args.filter((f) => !f.startsWith("src/i18n/msg/"));
if (!srcs.length && !mods.length) { console.log("usage: node scripts/i18n-th-check.mjs <source files...> <src/i18n/msg modules...>"); process.exit(2); }

// {name}, {name|a|b}, {stream-end+30}: any brace group (one nesting level) becomes a slot.
const TOKEN = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
const norm = (s) => s.replace(TOKEN, SLOT);
const show = (s) => s.replaceAll(SLOT, "{…}").replace(/\s+/g, " ").slice(0, 120);
const parse = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

// Babel/React JSX text cleaning (cleanJSXElementLiteralChild).
function jsxText(value) {
  const lines = value.split(/\r\n|\n|\r/);
  let last = 0;
  lines.forEach((l, i) => { if (/[^ \t]/.test(l)) last = i; });
  let out = "";
  lines.forEach((line, i) => {
    let t = line.replace(/\t/g, " ");
    if (i !== 0) t = t.replace(/^[ ]+/, "");
    if (i !== lines.length - 1) t = t.replace(/[ ]+$/, "");
    if (t) { if (i !== last) t += " "; out += t; }
  });
  return decode(out);
}

// HTML entities in JSX text render as their characters.
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s) => s.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi, (m, hex, dec, name) =>
  hex ? String.fromCodePoint(parseInt(hex, 16)) : dec ? String.fromCodePoint(+dec) : ENT[name] ?? m);

// Units of one source text: { line, text, kind, pieces? }.
function units(file, text) {
  const sf = parse(file, text), out = [];
  const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const walk = (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      if (THAI.test(n.text)) out.push({ line: line(n), text: n.text, kind: "string" });
    } else if (ts.isTemplateExpression(n)) {
      const t = n.head.text + n.templateSpans.map((s) => SLOT + s.literal.text).join("");
      if (THAI.test(t)) out.push({ line: line(n), text: t, kind: "template" });
    } else if (n.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      const src = n.getText(sf).replace(/^\/|\/[a-z]*$/g, "");
      if (THAI.test(src)) out.push({ line: line(n), text: src, kind: "regex" });
    } else if (ts.isJsxElement(n) || ts.isJsxFragment(n)) {
      if (n.children.some((c) => ts.isJsxText(c) && THAI.test(c.text))) {
        let run = "";
        const pieces = [];
        for (const c of n.children) {
          if (ts.isJsxText(c)) { const t = jsxText(c.text); run += t; if (THAI.test(t)) pieces.push(t.trim()); }
          else if (ts.isJsxExpression(c)) { if (c.expression) run += SLOT; }
          else run += SLOT;
        }
        out.push({ line: line(n), text: run, kind: "jsx", pieces }); // untrimmed: React keeps spaces on single-line text
      }
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return out;
}

// th values of a dictionary module, read from its AST (no execution).
function thValues(file) {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8"), sf = parse(file, text), out = [];
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || d.name.text !== "th" || !d.initializer || !ts.isObjectLiteralExpression(d.initializer)) continue;
      for (const p of d.initializer.properties) {
        if (!ts.isPropertyAssignment(p) || !(ts.isStringLiteral(p.initializer) || ts.isNoSubstitutionTemplateLiteral(p.initializer))) continue;
        out.push({ key: p.name.getText(sf).replace(/^["']|["']$/g, ""), value: p.initializer.text });
      }
    }
  }
  return out;
}

const head = (f) => { try { return execFileSync("git", ["show", `HEAD:${f}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 1e8 }); } catch { return null; } };

// Legacy span() template `${h} ชม.${m ? ` ${m} น.` : ""}`, replaced by fmt.dur (tested equal in i18n-fmt.test.ts).
const VIA_FMT = new Set([SLOT + " ชม." + SLOT]);
const errors = [], warnings = [];
const all = new Map(); // normalized th value -> "module:key"
for (const f of [...new Set([...ALWAYS, ...mods])]) for (const { key, value } of thValues(f)) all.set(norm(value), `${path.basename(f, ".ts")}:${key}`);
const values = [...all.keys()];
const oldUnits = [];

for (const f of srcs) {
  const old = head(f);
  if (old === null) { errors.push(`ERROR ${f}: not in HEAD`); continue; }
  const us = units(f, old);
  oldUnits.push(...us);
  // Literals still present under an i18n-allow marker in the current file.
  const cur = fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), "utf8") : "";
  const marked = new Set(), lines = cur.split(/\r?\n/);
  for (const u of units(f, cur)) if (/\/\/\s*i18n-allow:\s*\S{3,}/.test(lines[u.line - 1] ?? "") || /\/\/\s*i18n-allow:\s*\S{3,}/.test(lines[u.line - 2] ?? "")) marked.add(norm(u.text));
  for (const u of us) {
    const n = norm(u.text);
    if (all.has(n) || marked.has(n) || all.has(norm(u.text.trim())) || VIA_FMT.has(n)) continue; // edge spaces of a JSX run may sit outside the key
    if (u.kind === "jsx" && u.pieces.length && u.pieces.every((p) => all.has(norm(p)) || marked.has(norm(p)))) { warnings.push(`WARNING split run ${f}:${u.line}: ${show(u.text)}  (check the spaces around the expressions)`); continue; }
    if (values.some((v) => v.includes(n))) { warnings.push(`WARNING merged ${f}:${u.line}: ${show(u.text)}  (only part of a th value)`); continue; }
    errors.push(`ERROR ${f}:${u.line}: ${show(u.text)}  (no th value matches)`);
  }
}

// Reverse: every Thai piece of the batch modules' th values must exist in some old unit.
const hay = oldUnits.map((u) => norm(u.text));
for (const f of mods.filter((m) => !ALWAYS.includes(m))) for (const { key, value } of thValues(f)) {
  for (const piece of norm(value).split(SLOT)) {
    if (THAI.test(piece) && !hay.some((h) => h.includes(piece))) { errors.push(`ERROR ${f} ${key}: Thai piece ${JSON.stringify(piece)} is in no original literal (invented or rephrased?)`); break; }
  }
}

for (const w of warnings) console.log(w);
for (const e of errors) console.log(e);
console.log(`i18n-th-check: ${oldUnits.length} units in ${srcs.length} files, ${warnings.length} warnings, ${errors.length} errors`);
process.exit(errors.length ? 1 : 0);
