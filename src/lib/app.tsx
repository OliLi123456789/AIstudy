/* App-wide context: opens the local database once, builds the active engine from
   prefs + stored key, and exposes both to every page. A `version` counter lets
   pages cheaply refresh their data after writes. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Repo } from "./db";
import { idbStore } from "./db/idb";
import { memoryStore } from "./db/memory";
import { createEngine } from "./engine";
import type { Engine } from "./engine/types";
import { resilient } from "./engine/resilient";
import { getClientAuthToken } from "./engine/auth";
import { getEnginePrefs, saveEnginePrefs } from "./prefs";
import type { EnginePrefs } from "./types";
import { getSupabase } from "./supabase";
import { reconcileJobs } from "./generation/pipeline";

let repoPromise: Promise<Repo> | null = null;
export function getRepo(): Promise<Repo> {
  if (!repoPromise) {
    repoPromise = (async () => {
      try {
        return new Repo(await idbStore());
      } catch {
        return new Repo(memoryStore());
      }
    })();
  }
  return repoPromise;
}

/* Build the engine from a client auth token (Supabase user when signed in,
   otherwise the anonymous session token). All AI traffic goes through the
   same-origin /api/ai proxy — the DeepSeek key never reaches the browser. */
export async function buildEngine(): Promise<Engine | null> {
  const token = await getClientAuthToken();
  return resilient(
    createEngine({
      provider: "deepseek",
      apiKey: token,
      baseUrl: "/api/ai",
    }),
  );
}

interface AppCtx {
  repo: Repo | null;
  engine: Engine | null;
  prefs: EnginePrefs;
  ready: boolean;
  version: number;
  bump: () => void;
  savePrefs: (p: EnginePrefs) => void;
}

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<Repo | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [prefs, setPrefs] = useState<EnginePrefs>(() => getEnginePrefs());
  const [version, setVersion] = useState(0);
  const [ready, setReady] = useState(false);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const savePrefs = useCallback(
    (p: EnginePrefs) => {
      saveEnginePrefs(p);
      setPrefs(p);
    },
    [],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await getRepo();
      await r.cleanupStale(30).catch(() => {});
      await reconcileJobs(r).catch(() => {});
      const e = await buildEngine().catch(() => null);
      if (!alive) return;
      setRepo(r);
      setEngine(e);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* Auth gate: a signed-in Supabase user is always onboarded; when Supabase
     is configured and there is no session, force the landing page. This is
     what makes "logged out ⇒ landing" actually stick. */
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      setPrefs((prev) => ({ ...prev, onboarded: Boolean(data.session) }));
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setPrefs((prev) => ({ ...prev, onboarded: Boolean(session) }));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AppCtx>(
    () => ({ repo, engine, prefs, ready, version, bump, savePrefs }),
    [repo, engine, prefs, ready, version, bump, savePrefs],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside <AppProvider>");
  return v;
}
