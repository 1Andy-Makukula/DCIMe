import React, { createContext, useContext, useState, useCallback } from "react";
import { siteLabel } from "@/shared/utils/branding";

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
  const [currentSite, setCurrentSiteState] = useState<Site | null>(null);

  // site_code stays untouched — it is the key every query and blueprint lookup
  // matches on. site_name is display-only, so it is normalised to its generic
  // label here, once, instead of at each of the ~20 places that render it.
  const setCurrentSite = useCallback((site: Site | null) => {
    setCurrentSiteState(
      site ? { ...site, site_name: siteLabel(site.site_name ?? site.site_code) } : null
    );
  }, []);

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
