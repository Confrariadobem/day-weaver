import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";

export type ThemeMode = "soul" | "dusk" | "zen" | "ocean";

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "soul",
  setTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem("planmaster-theme");
    if (stored && ["soul", "dusk", "zen", "ocean"].includes(stored)) return stored as ThemeMode;
    return "soul";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("soul", "dusk", "zen", "ocean", "light", "dark");
    root.classList.add(theme);
    // Dark class for Tailwind's dark mode
    if (theme === "dusk" || theme === "zen" || theme === "ocean") {
      root.classList.add("dark");
    }
  }, [theme]);

  const setTheme = (t: ThemeMode) => {
    setThemeState(t);
    toast({ title: `Modo ${t.charAt(0).toUpperCase() + t.slice(1)} aplicado!` });
    // Debounced save
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      localStorage.setItem("planmaster-theme", t);
    }, 1000);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
