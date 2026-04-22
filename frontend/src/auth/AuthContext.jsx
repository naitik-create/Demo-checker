import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch, setToken as persistToken } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("authToken") || "");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));

  // Keep in-memory auth state in sync with browser history/back-forward cache and localStorage.
  useEffect(() => {
    function syncTokenFromStorage() {
      const stored = localStorage.getItem("authToken") || "";
      setToken((prev) => (prev === stored ? prev : stored));
    }

    function onPageShow(e) {
      // When coming from BFCache, React may not rerun effects; force a sync.
      if (e?.persisted) syncTokenFromStorage();
    }

    window.addEventListener("storage", syncTokenFromStorage);
    window.addEventListener("focus", syncTokenFromStorage);
    window.addEventListener("popstate", syncTokenFromStorage);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("storage", syncTokenFromStorage);
      window.removeEventListener("focus", syncTokenFromStorage);
      window.removeEventListener("popstate", syncTokenFromStorage);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  useEffect(() => {
    persistToken(token);
  }, [token]);

  useEffect(() => {
    let alive = true;
    async function loadProfile() {
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await apiFetch("/api/auth/profile", { auth: true });
        if (!alive) return;
        setUser(res.user);
      } catch (e) {
        if (!alive) return;
        // Only clear session on real auth failure
        if (e?.status === 401) {
          setToken("");
          setUser(null);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    loadProfile();
    return () => {
      alive = false;
    };
  }, [token]);

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      isAuthed: Boolean(token && user),
      async login(email, password) {
        const res = await apiFetch("/api/auth/login", { method: "POST", body: { email, password } });
        setToken(res.token);
        setUser(res.user);
        return res;
      },
      async register({ name, email, password, role }) {
        const res = await apiFetch("/api/auth/register", {
          method: "POST",
          body: { name, email, password, role }
        });
        setToken(res.token);
        setUser(res.user);
        return res;
      },
      logout() {
        setToken("");
        setUser(null);
      }
    }),
    [token, user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

