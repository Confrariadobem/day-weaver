import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface CurrencyContextType {
  currency: string;
  setCurrency: (c: string) => void;
  formatCurrency: (value: number) => string;
}

const CURRENCY_CONFIG: Record<string, { symbol: string; decimals: number; locale: string }> = {
  BRL: { symbol: "R$", decimals: 2, locale: "pt-BR" },
  USD: { symbol: "US$", decimals: 2, locale: "en-US" },
  EUR: { symbol: "€", decimals: 2, locale: "de-DE" },
  BTC: { symbol: "₿", decimals: 2, locale: "en-US" },
};

const CurrencyContext = createContext<CurrencyContextType>({
  currency: "BRL",
  setCurrency: () => {},
  formatCurrency: (v) => `R$ ${v.toFixed(2)}`,
});

export const useCurrency = () => useContext(CurrencyContext);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [currency, setCurrencyState] = useState("BRL");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("currency")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if ((data as any)?.currency) setCurrencyState((data as any).currency);
      });
  }, [user]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.currency) setCurrencyState(detail.currency);
    };
    window.addEventListener("lovable:currency-changed", handler);
    return () => window.removeEventListener("lovable:currency-changed", handler);
  }, []);

  const setCurrency = useCallback((c: string) => {
    setCurrencyState(c);
    window.dispatchEvent(new CustomEvent("lovable:currency-changed", { detail: { currency: c } }));
  }, []);

  const formatCurrency = useCallback(
    (value: number) => {
      const cfg = CURRENCY_CONFIG[currency] || CURRENCY_CONFIG.BRL;
      return `${cfg.symbol} ${value.toFixed(cfg.decimals).replace(/\B(?=(\d{3})+(?!\d))/g, currency === "BRL" || currency === "EUR" ? "." : ",").replace(/\.(\d+)$/, currency === "BRL" || currency === "EUR" ? ",$1" : ".$1")}`;
    },
    [currency]
  );

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, formatCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
}
