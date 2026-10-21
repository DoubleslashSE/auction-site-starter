import { createContext, useContext, useEffect, type ReactNode } from "react";
import { api, call, type Category, type House, type Schemas } from "./lib/api";
import { signIn } from "./lib/auth";
import { useAsync, useSignedIn } from "./lib/hooks";

export type Me = Schemas["MyProfile"];
export type SiteInfo = Schemas["SiteInfo"];

export interface SiteState {
  house: House;
  /** Sign-up and the support address. */
  info: SiteInfo | null;
  categories: Category[];
  signedIn: boolean;
  /** The signed-in person, once loaded. */
  me: Me | null;
  /** Sends the visitor to sign in and back to this page. */
  signIn: () => void;
  reloadCategories: () => void;
}

const SiteContext = createContext<SiteState | null>(null);

export function useSite(): SiteState {
  const state = useContext(SiteContext);
  if (!state) throw new Error("useSite must be used inside <SiteProvider>.");
  return state;
}

/** Loads the house, its categories and the signed-in person once for every page. */
export function SiteProvider({ children }: { children: ReactNode }) {
  const signedIn = useSignedIn();
  const house = useAsync(() => call(api().GET("/api/v1/house")), []);
  const info = useAsync(() => call(api().GET("/api/v1/site")), []);
  const categories = useAsync(() => call(api().GET("/api/v1/categories")), []);
  const me = useAsync(() => (signedIn ? call(api().GET("/api/v1/me")) : Promise.resolve(null)), [signedIn]);

  useEffect(() => {
    if (house.data) document.title = house.data.name;
  }, [house.data]);

  if (house.error) {
    return (
      <main className="page">
        <h1>The auction house could not be reached</h1>
        <p className="muted">Please try again in a moment.</p>
      </main>
    );
  }

  if (!house.data) {
    return (
      <main className="page" aria-busy="true">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  return (
    <SiteContext.Provider
      value={{
        house: house.data,
        info: info.data ?? null,
        categories: categories.data ?? [],
        signedIn,
        me: me.data ?? null,
        signIn: () => void signIn(),
        reloadCategories: categories.reload,
      }}
    >
      {children}
    </SiteContext.Provider>
  );
}
