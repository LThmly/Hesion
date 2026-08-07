/**
 * Compact replies use:
 *   <<answer>>   one-line result
 *   <<explain>>  explanation (chevron)
 * Deeper detail is fetched on demand via elaborate(), not embedded here.
 */
export function splitCompactAnswer(text: string): {
  answer: string;
  explain: string;
} {
  const raw = text.trim();
  if (!raw) return { answer: "", explain: "" };

  const tagged = raw.match(
    /<<\s*answer\s*>>\s*([\s\S]*?)(?:<<\s*explain\s*>>\s*([\s\S]*?))?(?:<<\s*detail\s*>>\s*[\s\S]*)?$/i,
  );
  if (tagged) {
    return {
      answer: tagged[1].trim(),
      explain: (tagged[2] ?? "").trim(),
    };
  }

  const change = raw.match(
    /\*\*Change\s*=\s*([^*]+?)\*\*|\bChange\s*=\s*([^*\n]+)/i,
  );
  if (change) {
    const answer = (change[1] || change[2] || "").trim();
    if (answer) return { answer, explain: raw };
  }

  const parts = raw.split(/\n\s*\n/);
  if (parts.length >= 2) {
    return {
      answer: parts[0].trim(),
      explain: parts.slice(1).join("\n\n").trim(),
    };
  }

  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    return { answer: lines[0], explain: lines.slice(1).join("\n") };
  }

  return { answer: raw, explain: "" };
}
