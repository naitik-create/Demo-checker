import { createContext, useContext, useEffect, useState } from "react";
import { BASE_URL } from "../api/client.js";

const AppSettingsContext = createContext({ logoUrl: null, logoDarkUrl: null, refreshLogo: () => {} });

export function AppSettingsProvider({ children }) {
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoDarkUrl, setLogoDarkUrl] = useState(null);

  async function fetchLogo() {
    try {
      const res = await fetch(`${BASE_URL}/api/settings/logo`);
      const data = await res.json();
      setLogoUrl(data.logoUrl ? `${BASE_URL}${data.logoUrl}` : null);
      setLogoDarkUrl(data.logoDarkUrl ? `${BASE_URL}${data.logoDarkUrl}` : null);
    } catch {}
  }

  useEffect(() => { fetchLogo(); }, []);

  return (
    <AppSettingsContext.Provider value={{ logoUrl, logoDarkUrl, refreshLogo: fetchLogo }}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  return useContext(AppSettingsContext);
}
