import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { CaptureMode } from "../shared/types";

export interface CaptureResult {
  data: string;
  mimeType: string;
  previewDataUrl: string;
  filePath: string;
}

function run(
  cmd: string,
  args: string[],
  opts?: { timeoutMs?: number },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: process.env });
    let stdout = "";
    let stderr = "";
    const timer =
      opts?.timeoutMs != null
        ? setTimeout(() => {
            child.kill("SIGTERM");
            reject(new Error(`${cmd} timed out after ${opts.timeoutMs}ms`));
          }, opts.timeoutMs)
        : null;

    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function captureDir(): string {
  const outDir = path.join(os.tmpdir(), "hesion-captures");
  fs.mkdirSync(outDir, { recursive: true });
  return outDir;
}

function newPngPath(): string {
  return path.join(captureDir(), `${randomUUID()}.png`);
}

async function focusedMonitor(): Promise<string | null> {
  try {
    const result = await run("hyprctl", ["monitors", "-j"], { timeoutMs: 3000 });
    if (result.code !== 0) return null;
    const monitors = JSON.parse(result.stdout) as Array<{
      name?: string;
      focused?: boolean;
    }>;
    return monitors.find((m) => m.focused)?.name || monitors[0]?.name || null;
  } catch {
    return null;
  }
}

/** Non-interactive full-monitor capture — preferred for “include screen” */
async function captureWithGrim(mode: CaptureMode): Promise<string> {
  const filePath = newPngPath();

  if (mode === "region") {
    const geo = await run("slurp", [], { timeoutMs: 120_000 });
    if (geo.code !== 0 || !geo.stdout.trim()) {
      throw new Error("Region selection cancelled");
    }
    const result = await run("grim", ["-g", geo.stdout.trim(), filePath], {
      timeoutMs: 15_000,
    });
    if (result.code !== 0 || !fs.existsSync(filePath)) {
      throw new Error(result.stderr || "grim region capture failed");
    }
    return filePath;
  }

  const monitor = await focusedMonitor();
  const args = monitor ? ["-o", monitor, filePath] : [filePath];
  const result = await run("grim", args, { timeoutMs: 10_000 });
  if (result.code !== 0 || !fs.existsSync(filePath)) {
    throw new Error(result.stderr || "grim capture failed");
  }
  return filePath;
}

async function captureWithHyprshot(mode: CaptureMode): Promise<string> {
  const outDir = captureDir();
  const fileName = `${randomUUID()}.png`;
  const filePath = path.join(outDir, fileName);

  const cleanArgs =
    mode === "output"
      ? ["-m", "output", "-m", "active", "-o", outDir, "-f", fileName, "-s"]
      : mode === "window"
        ? ["-m", "window", "-m", "active", "-o", outDir, "-f", fileName, "-s"]
        : ["-m", "region", "-o", outDir, "-f", fileName, "-s"];

  const result = await run("hyprshot", cleanArgs, {
    timeoutMs: mode === "region" ? 120_000 : 12_000,
  });

  if (fs.existsSync(filePath)) return filePath;

  // hyprshot may rename — pick newest png
  const files = fs
    .readdirSync(outDir)
    .filter((f) => f.endsWith(".png"))
    .map((f) => ({ f, t: fs.statSync(path.join(outDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);

  if (files.length && Date.now() - files[0]!.t < 15_000) {
    return path.join(outDir, files[0]!.f);
  }

  throw new Error(
    `hyprshot failed (code ${result.code}): ${result.stderr || result.stdout || "no image"}`,
  );
}

export async function captureScreen(mode: CaptureMode): Promise<CaptureResult> {
  let filePath: string;
  const errors: string[] = [];

  // Prefer grim for output (instant, no UI). Use hyprshot for window/region.
  if (mode === "output") {
    try {
      filePath = await captureWithGrim("output");
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      try {
        filePath = await captureWithHyprshot("output");
      } catch (err2) {
        errors.push(err2 instanceof Error ? err2.message : String(err2));
        throw new Error(`Screen capture failed: ${errors.join(" | ")}`);
      }
    }
  } else {
    try {
      filePath = await captureWithHyprshot(mode);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      try {
        filePath = await captureWithGrim(mode === "window" ? "output" : mode);
      } catch (err2) {
        errors.push(err2 instanceof Error ? err2.message : String(err2));
        throw new Error(`Screen capture failed: ${errors.join(" | ")}`);
      }
    }
  }

  const buf = fs.readFileSync(filePath);
  // Cap very large screenshots so API requests don't hang/fail silently
  let data = buf.toString("base64");
  let mimeType = "image/png";
  if (buf.length > 4_500_000) {
    // Still send, but warn via filename path; APIs usually accept compressed PNG
    console.warn(
      `Screenshot is large (${Math.round(buf.length / 1024)}KB); sending anyway`,
    );
  }

  return {
    data,
    mimeType,
    previewDataUrl: `data:${mimeType};base64,${data}`,
    filePath,
  };
}

export async function deleteCapture(filePath: string): Promise<void> {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

export async function getActiveWindowMeta(): Promise<string | null> {
  try {
    const result = await run("hyprctl", ["activewindow", "-j"], {
      timeoutMs: 3000,
    });
    if (result.code !== 0) return null;
    const win = JSON.parse(result.stdout) as {
      class?: string;
      title?: string;
    };
    if (!win.class && !win.title) return null;
    const cls = (win.class || "").toLowerCase();
    const title = (win.title || "").toLowerCase();
    // Hesion is focused when sending, so this is never useful context.
    if (cls.includes("hesion") || title.includes("hesion")) return null;
    return `Active window: ${win.class || "unknown"} — ${win.title || "untitled"}`;
  } catch {
    return null;
  }
}

export async function getClipboardText(): Promise<string | null> {
  try {
    const result = await run("wl-paste", ["--no-newline"], { timeoutMs: 3000 });
    if (result.code !== 0) return null;
    const text = result.stdout.trim();
    if (!text) return null;
    return text.length > 20_000 ? text.slice(0, 20_000) : text;
  } catch {
    return null;
  }
}
