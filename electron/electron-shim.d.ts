declare module "electron" {
  export interface BrowserWindowConstructorOptions {
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
    title?: string;
    backgroundColor?: string;
    show?: boolean;
    frame?: boolean;
    transparent?: boolean;
    alwaysOnTop?: boolean;
    skipTaskbar?: boolean;
    resizable?: boolean;
    hasShadow?: boolean;
    webPreferences?: {
      preload?: string;
      contextIsolation?: boolean;
      nodeIntegration?: boolean;
      sandbox?: boolean;
    };
  }

  export class BrowserWindow {
    constructor(options?: BrowserWindowConstructorOptions);
    static getAllWindows(): BrowserWindow[];
    loadURL(url: string): Promise<void>;
    loadFile(path: string): Promise<void>;
    once(event: string, listener: () => void): void;
    on(event: string, listener: (...args: any[]) => void): void;
    show(): void;
    hide(): void;
    focus(): void;
    close(): void;
    isDestroyed(): boolean;
    setTitle(title: string): void;
    setAlwaysOnTop(flag: boolean, level?: string): void;
    setMinimumSize(width: number, height: number): void;
    setMaximumSize(width: number, height: number): void;
    setSize(width: number, height: number, animate?: boolean): void;
    setBounds(
      bounds: { x?: number; y?: number; width: number; height: number },
      animate?: boolean,
    ): void;
    getBounds(): { x: number; y: number; width: number; height: number };
    webContents: {
      send(channel: string, ...args: unknown[]): void;
      isLoading(): boolean;
      once(event: string, listener: () => void): void;
      on(event: string, listener: (...args: any[]) => void): void;
      setWindowOpenHandler(
        handler: (details: { url: string }) => { action: "allow" | "deny" },
      ): void;
    };
  }

  export const app: {
    whenReady(): Promise<void>;
    on(event: string, listener: (...args: any[]) => void): void;
    quit(): void;
    requestSingleInstanceLock?: () => boolean;
    setName?: (name: string) => void;
  };

  export const ipcMain: {
    handle(
      channel: string,
      listener: (event: unknown, ...args: any[]) => unknown | Promise<unknown>,
    ): void;
  };

  export const ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<any>;
    on(
      channel: string,
      listener: (event: unknown, ...args: any[]) => void,
    ): void;
    removeListener(
      channel: string,
      listener: (event: unknown, ...args: any[]) => void,
    ): void;
  };

  export const contextBridge: {
    exposeInMainWorld(apiKey: string, api: unknown): void;
  };

  export const globalShortcut: {
    register(accelerator: string, callback: () => void): boolean;
    unregisterAll(): void;
  };

  export const shell: {
    openExternal(url: string): Promise<void>;
  };

  export const Menu: {
    setApplicationMenu(menu: null): void;
  };

  export type IpcRendererEvent = unknown;
}
