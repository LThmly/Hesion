import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  shell,
  Menu,
} from "electron";
import path from "node:path";
import { store } from "./store";
import { DEFAULT_MODELS, type HesionConfig, type ThemeMode } from "../shared/types";
import { transcribeAudio } from "./whisper";
import { hyprEnterCompact, hyprGetSize, hyprLeaveCompact } from "./hyprland";

const isDev = process.argv.includes("--dev");

const COMPACT_HEIGHT = 56;
const COMPACT_MIN_WIDTH = 320;
const NORMAL_BOUNDS = { width: 420, height: 640 };

function windowBg(theme: ThemeMode): string {
  return theme === "light" ? "#e4e4e6" : "#000000";
}

const gotLock = app.requestSingleInstanceLock?.() ?? true;
if (!gotLock) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let savedBounds: {
  x: number;
  y: number;
  width: number;
  height: number;
} | null = null;

function preloadPath(): string {
  return path.join(__dirname, "preload.cjs");
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: NORMAL_BOUNDS.width,
    height: NORMAL_BOUNDS.height,
    minWidth: 280,
    minHeight: 200,
    title: "Hesion",
    icon: path.join(__dirname, "../assets/logo.png"),
    backgroundColor: windowBg(store.getState().config.theme),
    show: false,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.once("ready-to-show", () => {
    win.show();
    win.focus();
  });

  if (isDev) {
    void win.loadURL("http://localhost:5173/");
  } else {
    void win.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  const isAppNavigation = (url: string): boolean => {
    if (isDev) return url.startsWith("http://127.0.0.1:5173") || url.startsWith("http://localhost:5173");
    return url.startsWith("file:");
  };

  // Same-tab <a href> navigates the webContents — send those out of process.
  win.webContents.on("will-navigate", (event, url) => {
    if (isAppNavigation(url)) return;
    event.preventDefault();
    void shell.openExternal(url);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  win.on("closed", () => {
    mainWindow = null;
  });

  return win;
}

/** Wait until the renderer has painted at least one frame. */
async function waitForRendererPaint(win: BrowserWindow): Promise<void> {
  try {
    await win.webContents.executeJavaScript(
      `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`,
    );
  } catch {
    await new Promise((r) => setTimeout(r, 32));
  }
}

/** Compact UI + tiled relative resize so the sibling above/below fills the gap. */
async function applyCompactMode(enabled: boolean): Promise<void> {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;

  if (enabled) {
    // Hide expanded UI (centered empty logo, chat body) in the renderer
    // BEFORE Hyprland shrinks — otherwise the logo rides the resize upward.
    try {
      await win.webContents.executeJavaScript(
        `document.documentElement.classList.add("hesion-compact");
         document.documentElement.classList.remove(
           "hesion-compact-tall",
           "hesion-leaving-compact",
         );
         document.documentElement.style.removeProperty("--compact-chrome-h");`,
      );
    } catch {
      // ignore
    }
    store.setCompactMode(true);
    await waitForRendererPaint(win);
    // Let chrome actions crossfade before the tile shrinks.
    await new Promise((r) => setTimeout(r, 200));

    const hypr = await hyprGetSize();
    const electronBounds = win.getBounds();
    // Only snapshot if we still look "expanded" — avoid saving an already-compact height
    const snapshot = hypr ?? electronBounds;
    if (!savedBounds || snapshot.height > COMPACT_HEIGHT + 40) {
      savedBounds = snapshot;
    }

    win.setTitle("Hesion · compact");
    // Allow the web contents to shrink with the tile (default minHeight is 200,
    // which leaves a 200px layout clipped to ~56px of empty black).
    win.setMinimumSize(COMPACT_MIN_WIDTH, COMPACT_HEIGHT);

    const width = Math.max((savedBounds ?? snapshot).width, COMPACT_MIN_WIDTH);
    const ok = await hyprEnterCompact(width, COMPACT_HEIGHT);
    if (!ok) {
      console.warn("compact: hypr enter failed; UI switched anyway");
    }
  } else {
    win.setMinimumSize(280, 200);
    win.setTitle("Hesion");

    const current = (await hyprGetSize()) ?? win.getBounds();
    const b = savedBounds ?? {
      x: current.x,
      y: current.y,
      width: Math.max(current.width, NORMAL_BOUNDS.width),
      height: Math.max(current.height, NORMAL_BOUNDS.height),
    };
    savedBounds = null;

    const needsGrow = current.height < b.height - 20;

    if (needsGrow) {
      // Swap chrome first (body stays collapsed), let actions crossfade, then
      // grow the tile, then fade the body in.
      try {
        await win.webContents.executeJavaScript(
          `document.documentElement.classList.add("hesion-leaving-compact");
           document.documentElement.classList.remove(
             "hesion-compact",
             "hesion-compact-tall",
             "hesion-revealing",
           );
           document.documentElement.style.removeProperty("--compact-chrome-h");`,
        );
      } catch {
        // ignore
      }
      store.setCompactMode(false);
      await waitForRendererPaint(win);
      // Match .chrome-action opacity transition before the tile moves.
      await new Promise((r) => setTimeout(r, 200));
      await hyprLeaveCompact(b.width, b.height);
      try {
        await win.webContents.executeJavaScript(
          `document.documentElement.classList.add("hesion-revealing");
           document.documentElement.classList.remove("hesion-leaving-compact");`,
        );
        await waitForRendererPaint(win);
        await win.webContents.executeJavaScript(
          `document.documentElement.classList.remove("hesion-revealing")`,
        );
      } catch {
        try {
          await win.webContents.executeJavaScript(
            `document.documentElement.classList.remove(
               "hesion-leaving-compact",
               "hesion-revealing",
             )`,
          );
        } catch {
          // ignore
        }
      }
    } else {
      // Already tall (e.g. explain-expanded) — swap chrome + body together so
      // the explain band is replaced by chat instead of collapsing to black.
      store.setCompactMode(false);
      try {
        await win.webContents.executeJavaScript(
          `document.documentElement.classList.remove(
             "hesion-compact",
             "hesion-compact-tall",
             "hesion-leaving-compact",
             "hesion-revealing",
           );
           document.documentElement.style.removeProperty("--compact-chrome-h");`,
        );
      } catch {
        // ignore
      }
      if (Math.abs(current.height - b.height) > 2) {
        await hyprLeaveCompact(b.width, b.height);
      }
    }
  }
}

function toggleCompactMode(): void {
  void applyCompactMode(!store.getState().compactMode);
}

function registerHotkey(accel: string): void {
  globalShortcut.unregisterAll();
  if (!accel) return;
  const ok = globalShortcut.register(accel, () => {
    toggleCompactMode();
  });
  if (!ok) {
    console.warn(`Failed to register hotkey: ${accel}`);
  }
}

function broadcastState(): void {
  const state = store.getState();
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send("hesion:state", state);
  }
}

function setupIpc(): void {
  store.subscribe(() => broadcastState());

  ipcMain.handle("hesion:get-state", () => store.getState());
  ipcMain.handle("hesion:get-models", () => DEFAULT_MODELS);

  ipcMain.handle("hesion:update-config", (_e, partial: Partial<HesionConfig>) => {
    store.updateConfig(partial);
    if (partial.compactHotkey !== undefined) {
      registerHotkey(store.getState().config.compactHotkey);
    }
    if (partial.theme !== undefined && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setBackgroundColor(windowBg(partial.theme));
    }
    return store.getState();
  });

  ipcMain.handle("hesion:create-session", () => {
    store.createSession();
    return store.getState();
  });

  ipcMain.handle("hesion:delete-session", (_e, id: string) => {
    store.deleteSession(id);
    return store.getState();
  });

  ipcMain.handle("hesion:set-active-session", (_e, id: string) => {
    store.setActiveSession(id);
    return store.getState();
  });

  ipcMain.handle("hesion:rename-session", (_e, id: string, title: string) => {
    store.renameSession(id, title);
    return store.getState();
  });

  ipcMain.handle("hesion:set-session-model", (_e, id: string, model: string) => {
    store.setSessionModel(id, model);
    return store.getState();
  });

  ipcMain.handle("hesion:set-screen-context", (_e, enabled: boolean) => {
    store.setScreenContextEnabled(enabled);
    return store.getState();
  });

  ipcMain.handle("hesion:capture-screen", async () => {
    await store.captureForContext();
    return store.getState();
  });

  ipcMain.handle("hesion:clear-attachment", () => {
    store.clearAttachment();
    return store.getState();
  });

  ipcMain.handle(
    "hesion:attach-image",
    (
      _e,
      data: string,
      mimeType: string,
      source: "screen" | "paste" | "file" = "file",
    ) => {
      store.setAttachmentFromData(data, mimeType, source);
      return store.getState();
    },
  );

  ipcMain.handle("hesion:send-message", async (_e, text: string) => {
    await store.sendMessage(text);
    return store.getState();
  });

  ipcMain.handle("hesion:elaborate", async () => {
    await store.elaborate();
    return store.getState();
  });

  ipcMain.handle("hesion:harvest-flashcards", async () => {
    await store.harvestFlashcards();
    return store.getState();
  });

  ipcMain.handle("hesion:generate-quiz", async () => {
    await store.generateQuiz();
    return store.getState();
  });

  ipcMain.handle("hesion:delete-flashcard", (_e, cardId: string) => {
    store.deleteFlashcard(cardId);
    return store.getState();
  });

  ipcMain.handle("hesion:clear-active-quiz", () => {
    store.clearActiveQuiz();
    return store.getState();
  });

  ipcMain.handle("hesion:clear-usage", () => {
    store.clearUsage();
    return store.getState();
  });

  ipcMain.handle("hesion:cancel-stream", async () => {
    await store.cancelStream();
    return store.getState();
  });

  ipcMain.handle(
    "hesion:transcribe",
    async (_e, audioBase64: string, mimeType: string) => {
      const text = await transcribeAudio(
        store.getState().config.apiKeys,
        audioBase64,
        mimeType,
      );
      return text;
    },
  );

  ipcMain.handle("hesion:set-compact-mode", async (_e, enabled: boolean) => {
    await applyCompactMode(enabled);
    return store.getState();
  });

  ipcMain.handle("hesion:toggle-compact-mode", async () => {
    await applyCompactMode(!store.getState().compactMode);
    return store.getState();
  });

  /** Grow/shrink compact chrome height without leaving compact mode. */
  ipcMain.handle("hesion:set-compact-height", async (_e, height: number) => {
    if (!store.getState().compactMode) return store.getState();
    const win = mainWindow;
    if (!win || win.isDestroyed()) return store.getState();

    const maxH = Math.max(NORMAL_BOUNDS.height, savedBounds?.height ?? 0, 720);
    const h = Math.round(
      Math.min(Math.max(Number(height) || COMPACT_HEIGHT, COMPACT_HEIGHT), maxH),
    );
    win.setMinimumSize(COMPACT_MIN_WIDTH, COMPACT_HEIGHT);
    const width = Math.max(win.getBounds().width, COMPACT_MIN_WIDTH);
    await hyprEnterCompact(width, h);
    return store.getState();
  });

  /** Height of the last non-compact window (or the default expanded size). */
  ipcMain.handle("hesion:get-expanded-height", () => {
    return Math.round(savedBounds?.height ?? NORMAL_BOUNDS.height);
  });

  ipcMain.handle("hesion:export-markdown", (_e, id: string) => {
    return store.exportSessionMarkdown(id);
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  app.setName?.("hesion");
  store.init();
  setupIpc();

  app.on("second-instance", (_event, argv) => {
    if (argv.includes("--compact") || argv.includes("--toggle-compact")) {
      if (!mainWindow || mainWindow.isDestroyed()) {
        mainWindow = createMainWindow();
      } else {
        void applyCompactMode(!store.getState().compactMode);
        mainWindow.show();
        mainWindow.focus();
      }
      return;
    }
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = createMainWindow();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  mainWindow = createMainWindow();

  registerHotkey(store.getState().config.compactHotkey);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
