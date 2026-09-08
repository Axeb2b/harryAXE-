import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

interface SearchContextValue {
  query: string;
  setQuery: (q: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  focusSearch: () => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);

  const focusSearch = () => {
    // Two search inputs exist (desktop + mobile headers); focus the visible one.
    const els =
      document.querySelectorAll<HTMLInputElement>("input[data-search]");
    for (const el of els) {
      if (el.offsetParent !== null) {
        el.focus();
        el.select();
        return;
      }
    }
    searchRef.current?.focus();
  };

  return (
    <SearchContext.Provider value={{ query, setQuery, searchRef, focusSearch }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearch must be used within SearchProvider");
  return ctx;
}
