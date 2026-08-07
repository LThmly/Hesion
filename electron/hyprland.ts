import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function run(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      resolve({ code: 1, stdout: "", stderr: String(err) });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

/** Electron often strips HYPRLAND_* from env; rediscover from the runtime dir. */
function hyprEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (!env.XDG_RUNTIME_DIR) {
    env.XDG_RUNTIME_DIR = `/run/user/${typeof process.getuid === "function" ? process.getuid() : os.userInfo().uid}`;
  }

  if (!env.HYPRLAND_INSTANCE_SIGNATURE) {
    try {
      const base = path.join(env.XDG_RUNTIME_DIR, "hypr");
      const entries = fs
        .readdirSync(base, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
      const live = entries.find((name) =>
        fs.existsSync(path.join(base, name, ".socket.sock")),
      );
      if (live) env.HYPRLAND_INSTANCE_SIGNATURE = live;
      else if (entries[0]) env.HYPRLAND_INSTANCE_SIGNATURE = entries[0];
    } catch {
      // not on Hyprland
    }
  }

  return env;
}

interface HyprClient {
  address: string;
  title: string;
  class: string;
  initialClass?: string;
  pid: number;
  size: [number, number];
  at: [number, number];
  floating: boolean;
  workspace: { id: number };
}

async function listClients(): Promise<HyprClient[]> {
  const r = await run("hyprctl", ["clients", "-j"], hyprEnv());
  if (r.code !== 0 || !r.stdout.trim()) {
    if (r.stderr || r.stdout) {
      console.warn("hyprland: clients failed", (r.stderr || r.stdout).trim());
    }
    return [];
  }
  try {
    return JSON.parse(r.stdout) as HyprClient[];
  } catch {
    return [];
  }
}

async function findHesion(): Promise<HyprClient | null> {
  const clients = await listClients();
  return (
    clients.find((c) => /^hesion$/i.test(c.class)) ||
    clients.find((c) => /^hesion$/i.test(c.initialClass || "")) ||
    clients.find((c) => c.title === "Hesion" || c.title.startsWith("Hesion")) ||
    null
  );
}

async function findHesionWithRetry(
  attempts = 4,
  delayMs = 16,
): Promise<HyprClient | null> {
  for (let i = 0; i < attempts; i++) {
    const client = await findHesion();
    if (client) return client;
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return null;
}

async function dispatch(expr: string): Promise<boolean> {
  const r = await run("hyprctl", ["dispatch", expr], hyprEnv());
  const out = `${r.stdout}${r.stderr}`;
  if (r.code !== 0 || /error/i.test(out)) {
    console.warn("hyprland: dispatch failed", expr, out.trim() || r.code);
    return false;
  }
  return true;
}

function winSel(address: string): string {
  return `address:${address}`;
}

/** Same-column tiled neighbor directly above Hesion, if any. */
function hasSiblingAbove(
  hesion: HyprClient,
  clients: HyprClient[],
): boolean {
  return clients.some(
    (c) =>
      c.address !== hesion.address &&
      !c.floating &&
      c.workspace?.id === hesion.workspace?.id &&
      Math.abs(c.at[0] - hesion.at[0]) < 100 &&
      c.at[1] + c.size[1] <= hesion.at[1] + 40,
  );
}

/**
 * Same as Super+RMB resizewindow on Hesion: relative resize so the shared
 * split moves and the neighbor fills the space.
 *
 * Dwindle flips the Y meaning when the window sits below its sibling, so we
 * invert the delta in that case (same as dragging the shared edge).
 */
async function resizeHesionHeight(targetHeight: number): Promise<boolean> {
  // Serialize — overlapping relative resizes both read the same size and
  // apply the same delta twice, leaving the tile at the wrong height.
  return (resizeChain = resizeChain.then(() => resizeHesionHeightUnlocked(targetHeight)));
}

let resizeChain: Promise<boolean> = Promise.resolve(true);

async function resizeHesionHeightUnlocked(targetHeight: number): Promise<boolean> {
  const clients = await listClients();
  const hesion =
    clients.find((c) => /^hesion$/i.test(c.class)) ||
    clients.find((c) => c.title === "Hesion" || c.title.startsWith("Hesion"));
  if (!hesion) {
    console.warn("hyprland: Hesion window not found");
    return false;
  }

  const delta = Math.round(targetHeight - hesion.size[1]);
  if (delta === 0) return true;

  const apply = hasSiblingAbove(hesion, clients) ? -delta : delta;

  return dispatch(
    `hl.dsp.window.resize({ x = 0, y = ${apply}, relative = true, window = "${winSel(hesion.address)}" })`,
  );
}

export async function hyprEnterCompact(
  _width: number,
  height: number,
): Promise<boolean> {
  const client = await findHesionWithRetry();
  if (!client) return false;
  return resizeHesionHeight(height);
}

export async function hyprLeaveCompact(
  _width: number,
  height: number,
): Promise<boolean> {
  const client = await findHesionWithRetry();
  if (!client) return false;
  return resizeHesionHeight(height);
}

export async function hyprGetSize(): Promise<{
  width: number;
  height: number;
  x: number;
  y: number;
} | null> {
  const client = await findHesionWithRetry();
  if (!client) return null;
  return {
    x: client.at[0],
    y: client.at[1],
    width: client.size[0],
    height: client.size[1],
  };
}
