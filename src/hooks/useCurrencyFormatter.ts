import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const CURRENCY_CONFIG: Record<string, { symbol: string; decimals: number; locale: string }> = {
  BRL: { symbol: "R$", decimals: 2, locale: "pt-BR" },
  USD: { symbol: "US$", decimals: 2, locale: "en-US" },
  EUR: { symbol: "€", decimals: 2, locale: "de-DE" },
  BTC: { symbol: "₿", decimals: 8, locale: "en-US" },
};

/**
 * Returns a format(value) function that respects the user's currency preference.
 * Listens for "lovable:currency-changed" events for live updates.
 */
export function useCurrencyFormatter() {
  const { user } = useAuth();
  const [currency, setCurrency] = useState("BRL");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("currency")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if ((data as any)?.currency) setCurrency((data as any).currency);
      });
  }, [user]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.currency) setCurrency(detail.currency);
    };
    window.addEventListener("lovable:currency-changed", handler);
    return () => window.removeEventListener("lovable:currency-changed", handler);
  }, []);

  const format = useCallback(
    (value: number) => {
      const cfg = CURRENCY_CONFIG[currency] || CURRENCY_CONFIG.BRL;
      return new Intl.NumberFormat(cfg.locale, {
        style: "currency",
        currency: currency === "BTC" ? "XBT" : currency,
        minimumFractionDigits: cfg.decimals,
        maximumFractionDigits: cfg.decimals,
      })
        .format(value)
        // Intl may not know BTC, so replace symbol
        .replace(/XBT|BTC/, "₿");
    },
    [currency]
  );

  return { format, currency, setCurrency };
}
