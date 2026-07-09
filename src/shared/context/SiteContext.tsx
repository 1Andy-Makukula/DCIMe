import React, { createContext, useContext, useState } from "react";

export interface Site {
  id: string;
  site_code: string;
  site_name: string;
}

interface SiteContextType {
  currentSite: Site | null;
  setCurrentSite: (site: Site | null) => void;
}

const SiteContext = createContext<SiteContextType | undefined>(undefined);

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const [currentSite, setCurrentSite] = useState<Site | null>(null);

  return (
    <SiteContext.Provider value={{ currentSite, setCurrentSite }}>
      {children}
    </SiteContext.Provider>
  );
}

export function useCurrentSite() {
  const context = useContext(SiteContext);
  if (context === undefined) {
    throw new Error("useCurrentSite must be used within a SiteProvider");
  }
  return context;
}
