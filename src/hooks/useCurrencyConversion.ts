import { useState, useEffect, useCallback, useRef } from "react";

interface Rates {
  USD: number;
  EUR: number;
  BTC: number;
}

const CACHE_KEY = "currency_rates_cache";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedRates(): { rates: Rates; timestamp: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.timestamp < CACHE_TTL) return parsed;
    return null;
  } catch {
    return null;
  }
}

function setCachedRates(rates: Rates) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ rates, timestamp: Date.now() }));
}

export function useCurrencyConversion() {
  const [rates, setRates] = useState<Rates>({ USD: 0, EUR: 0, BTC: 0 });
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const cached = getCachedRates();
    if (cached) {
      setRates(cached.rates);
      setLoading(false);
      return;
    }

    const fetchRates = async () => {
      try {
        const res = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,BTC-BRL");
        const data = await res.json();
        const newRates: Rates = {
          USD: parseFloat(data?.USDBRL?.bid) || 0,
          EUR: parseFloat(data?.EURBRL?.bid) || 0,
          BTC: parseFloat(data?.BTCBRL?.bid) || 0,
        };
        setRates(newRates);
        setCachedRates(newRates);
      } catch {
        // fallback rates
        setRates({ USD: 5.0, EUR: 5.5, BTC: 350000 });
      } finally {
        setLoading(false);
      }
    };

    fetchRates();
  }, []);

  const convert = useCallback(
    (amountBRL: number, to: "USD" | "EUR" | "BTC") => {
      if (!rates[to] || rates[to] === 0) return 0;
      return amountBRL / rates[to];
    },
    [rates]
  );

  return { rates, loading, convert };
}
