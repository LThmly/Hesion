import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AppState, ModelInfo } from "@shared/types";
import {
  DEFAULT_CONFIG,
  EMPTY_USAGE_STATE,
  modelsForApiKeys,
} from "@shared/types";

interface HesionContextValue {
  state: AppState;
  models: ModelInfo[];
  ready: boolean;
}

const HesionContext = createContext<HesionContextValue | null>(null);

const emptyState: AppState = {
  sessions: [],
  activeSessionId: null,
  config: DEFAULT_CONFIG,
  screenContextEnabled: false,
  pendingAttachment: null,
  compactMode: false,
  streaming: false,
  elaborating: false,
  studying: false,
  activeQuiz: null,
  studyError: null,
  usage: EMPTY_USAGE_STATE,
};

export function HesionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(emptyState);
  const [allModels, setAllModels] = useState<ModelInfo[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let unsub = () => {};
    (async () => {
      const [s, m] = await Promise.all([
        window.hesion.getState(),
        window.hesion.getModels(),
      ]);
      setState(s);
      setAllModels(m);
      setReady(true);
      unsub = window.hesion.onState(setState);
    })();
    return () => unsub();
  }, []);

  const models = useMemo(
    () => modelsForApiKeys(allModels, state.config.apiKeys),
    [allModels, state.config.apiKeys],
  );

  return (
    <HesionContext.Provider value={{ state, models, ready }}>
      {children}
    </HesionContext.Provider>
  );
}

export function useHesion(): HesionContextValue {
  const ctx = useContext(HesionContext);
  if (!ctx) throw new Error("useHesion outside provider");
  return ctx;
}

export function useActiveSession() {
  const { state } = useHesion();
  return state.sessions.find((s) => s.id === state.activeSessionId) ?? null;
}
