import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import { visit } from "unist-util-visit";
import type { Root } from "mdast";
import "katex/dist/katex.min.css";

type Props = {
  children: string;
  /** Skip syntax highlighting (compact chrome). */
  compact?: boolean;
};

/** Run `fn` only on text outside $…$ / $$…$$. */
function mapOutsideMath(src: string, fn: (chunk: string) => string): string {
  const re = /\$\$[\s\S]+?\$\$|\$[^$\n]+\$/g;
  let out = "";
  let last = 0;
  for (const match of src.matchAll(re)) {
    const index = match.index ?? 0;
    out += fn(src.slice(last, index));
    out += match[0];
    last = index + match[0].length;
  }
  out += fn(src.slice(last));
  return out;
}

/**
 * Models break time/steady-state notation with extra `$`s:
 * `$i_L(0^-$)=0$`, `$V_7$\infty$=0$`, etc.
 */
function repairBrokenMathNotation(src: string): string {
  let out = src;

  out = out.replace(/\$\$([\s\S]+?)\$\$/g, (_m, inner: string) => {
    const cleaned = inner
      .replace(/\$\\infty\$/g, "\\infty")
      .replace(/\$0\^([+-])\$/g, "0^$1");
    return `$$${cleaned}$$`;
  });

  out = out.replace(/\(\\infty\$\)/g, "(\\infty)");
  out = out.replace(/\(0\^([+-])\$\)/g, "(0^$1)");
  out = out.replace(/\(t\s*=\s*0\^([+-])\$\)/g, "(t=0^$1)");

  out = out.replace(
    /\$([^$\n]+?)\$\((0\^[+-]|\\infty)\)/g,
    (_m, head: string, t: string) => `$${head}(${t})`,
  );

  out = out.replace(
    /([A-Za-z][A-Za-z0-9]*(?:_\{[^}]+\}|_[A-Za-z0-9]+)?)\$\\infty\$/g,
    "$1(\\infty)",
  );

  out = out.replace(
    /([A-Za-z][A-Za-z0-9]*(?:_\{[^}]+\}|_[A-Za-z0-9]+)?)\$0\^([+-])\$/g,
    "$1(0^$2)",
  );

  return out;
}

function fixTexCommands(src: string): string {
  let out = src;
  out = out.replace(/\\\\([a-zA-Z]+)/g, "\\$1");
  out = out.replace(/\\backslash\s*\\text\{infty\}/gi, "\\infty");
  out = out.replace(/\\text\{infty\}/gi, "\\infty");
  return out;
}

/** Convert \(…\) / \[…\] to $…$ / $$…$$ (before other outside-math passes). */
function convertLatexDelimiters(src: string): string {
  let out = src;
  // Use [\s\S]+? but stop at \); \infty is not \)
  out = out.replace(/\\\(([\s\S]+?)\\\)/g, (_m, inner: string) => `$${inner}$`);
  out = out.replace(
    /\\\[([\s\S]+?)\\\]/g,
    (_m, inner: string) => `$$${inner}$$`,
  );
  return out;
}

/** Bare (…TeX…) → $…$ — only outside existing math. */
function promoteBareParens(chunk: string): string {
  return chunk.replace(
    /(^|[^\\$])\((?!0\^[+-]|\\infty)([^()\n]*(?:\\[a-zA-Z]{2,}|_\{|_[0-9]+|\^\{|\^[+\-0-9])[^()\n]*)\)/g,
    (_m, pre: string, inner: string) => `${pre}$${inner}$`,
  );
}

/**
 * Wrap unfenced latex-heavy runs. Must only run outside $…$
 * (via mapOutsideMath) — never on a string that already contains fences.
 */
function wrapNakedLatex(chunk: string): string {
  if (!/\\frac/.test(chunk) || chunk.includes("$")) {
    return chunk;
  }
  // Prefer wrapping whole lines / sentences that contain \frac
  return chunk.replace(
    /(^|\n)([^\n]*\\frac\{[^}]*\}\{[^}]*\}[^\n]*)/g,
    (_m, pre: string, line: string) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("$")) return `${pre}${line}`;
      const leading = line.match(/^\s*/)?.[0] ?? "";
      const trailing = line.match(/\s*$/)?.[0] ?? "";
      return `${pre}${leading}$${trimmed}$${trailing}`;
    },
  );
}

/** Safety: strip accidental `$` fences left inside math node values. */
function remarkStripMathDollars() {
  return (tree: Root) => {
    visit(tree, (node) => {
      if (node.type !== "inlineMath" && node.type !== "math") return;
      const n = node as { value?: string };
      if (typeof n.value !== "string") return;
      let v = n.value.trim();
      // Repeatedly strip wrapping dollars from bad double-fencing
      while (
        (v.startsWith("$$") && v.endsWith("$$") && v.length > 4) ||
        (v.startsWith("$") && v.endsWith("$") && v.length > 2 && !v.slice(1, -1).includes("$"))
      ) {
        if (v.startsWith("$$") && v.endsWith("$$")) v = v.slice(2, -2).trim();
        else v = v.slice(1, -1).trim();
      }
      // Strip a single leading/trailing $ if present (katex: "Can't use $ in math mode")
      v = v.replace(/^\$+/, "").replace(/\$+$/, "");
      n.value = v;
    });
  };
}

function normalizeMathDelimiters(src: string): string {
  let out = repairBrokenMathNotation(src);
  out = fixTexCommands(out);
  // 1) Turn \(…\) into $…$ first so mapOutsideMath can protect them
  out = convertLatexDelimiters(out);
  // 2) Only touch unfenced regions
  out = mapOutsideMath(out, (chunk) =>
    wrapNakedLatex(promoteBareParens(chunk)),
  );
  out = repairBrokenMathNotation(out);
  return out;
}

export function Markdown({ children, compact }: Props) {
  const source = normalizeMathDelimiters(children);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkStripMathDollars, remarkGfm]}
      rehypePlugins={
        compact
          ? [[rehypeKatex, { throwOnError: false, strict: "ignore" }]]
          : [
              [rehypeKatex, { throwOnError: false, strict: "ignore" }],
              rehypeHighlight,
            ]
      }
      components={{
        a: ({ href, children: linkChildren, ...props }) => (
          <a
            {...props}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (
                href &&
                !/^https?:\/\//i.test(href) &&
                !href.startsWith("mailto:")
              ) {
                e.preventDefault();
              }
            }}
          >
            {linkChildren}
          </a>
        ),
      }}
    >
      {source}
    </ReactMarkdown>
  );
}
