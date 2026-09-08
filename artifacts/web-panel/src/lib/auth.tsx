import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

interface AuthState {
  isAuthenticated: boolean | null;
  userId: string | null;
  isAdmin: boolean;
  username: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
}

interface AuthContextValue extends AuthState {
  login: (data: {
    accessToken: string;
    refreshToken: string;
    telegramId: string;
    isAdmin: boolean;
    username: string;
    avatar?: string | null;
    expiresIn: number;
  }) => void;
  logout: () => void;
  getAccessToken: () => string | null;
}

const AUTH_KEY = "cyberzone_auth";
const AuthContext = createContext<AuthContextValue | null>(null);

async function revalidateSession(): Promise<AuthState | null> {
  const stored = localStorage.getItem(AUTH_KEY);
  if (!stored) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return null;
  }
  if (!parsed.accessToken) return null;

  // Check if token is expired or about to expire (within 2 min)
  const now = Date.now();
  const expiresAt = parsed.expiresAt || 0;
  if (expiresAt && now > expiresAt - 120000) {
    // Token expired or about to expire - try refresh
    if (parsed.refreshToken) {
      try {
        const r = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: parsed.refreshToken }),
        });
        if (r.ok) {
          const data = await r.json();
          const tokens = {
            accessToken: data.accessToken,
            refreshToken: parsed.refreshToken,
            telegramId: parsed.telegramId,
            isAdmin: parsed.isAdmin,
            username: parsed.username,
            expiresAt: Date.now() + data.expiresIn * 1000,
          };
          localStorage.setItem(AUTH_KEY, JSON.stringify(tokens));
          return {
            isAuthenticated: true,
            userId: parsed.telegramId,
            isAdmin: parsed.isAdmin,
            username: parsed.username,
            accessToken: data.accessToken,
            refreshToken: parsed.refreshToken,
            expiresAt: Date.now() + data.expiresIn * 1000,
          };
        }
      } catch {
        /* refresh failed, fall through to revalidation */
      }
    }
    return null;
  }

  // Validate access token with server
  try {
    const r = await fetch("/api/auth/me", {
      headers: {
        Authorization: `Bearer ${parsed.accessToken}`,
      },
    });
    if (r.status === 401) return null;
    if (!r.ok) {
      // Network blip — keep stored session
      return {
        isAuthenticated: true,
        userId: parsed.telegramId,
        isAdmin: !!parsed.isAdmin,
        username: parsed.username || "",
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken || null,
        expiresAt: parsed.expiresAt || null,
      };
    }
    const me = await r.json();
    return {
      isAuthenticated: true,
      userId: me.telegramId || parsed.telegramId,
      isAdmin: !!me.isAdmin,
      username: me.username || parsed.username || "",
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken || null,
      expiresAt: parsed.expiresAt || null,
    };
  } catch {
    // Network blip — keep stored session
    return {
      isAuthenticated: true,
      userId: parsed.telegramId,
      isAdmin: !!parsed.isAdmin,
      username: parsed.username || "",
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken || null,
      expiresAt: parsed.expiresAt || null,
    };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: null,
    userId: null,
    isAdmin: false,
    username: "",
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
  });

  useEffect(() => {
    let alive = true;
    const stored = localStorage.getItem(AUTH_KEY);
    if (!stored) {
      setState((s) => ({ ...s, isAuthenticated: false }));
      return;
    }
    revalidateSession().then((res) => {
      if (!alive) return;
      if (res) {
        setState(res);
      } else {
        localStorage.removeItem(AUTH_KEY);
        setState((s) => ({ ...s, isAuthenticated: false }));
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const login = (data: {
    accessToken: string;
    refreshToken: string;
    telegramId: string;
    isAdmin: boolean;
    username: string;
    expiresIn: number;
  }) => {
    const tokens = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      telegramId: data.telegramId,
      isAdmin: data.isAdmin,
      username: data.username,
      expiresAt: Date.now() + data.expiresIn * 1000,
    };
    localStorage.setItem(AUTH_KEY, JSON.stringify(tokens));
    setState({
      isAuthenticated: true,
      userId: data.telegramId,
      isAdmin: data.isAdmin,
      username: data.username,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + data.expiresIn * 1000,
    });
  };

  const logout = () => {
    localStorage.removeItem(AUTH_KEY);
    setState({
      isAuthenticated: false,
      userId: null,
      isAdmin: false,
      username: "",
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
    });
  };

  const getAccessToken = () => {
    return state.accessToken;
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout, getAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
