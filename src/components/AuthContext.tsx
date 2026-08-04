import {
  createContext,
  useContext,
  createSignal,
  type Accessor,
  type ParentComponent,
} from "solid-js";
import { backendRpc } from "~/lib/backend-rpc";
import { createRpcAction } from "~/lib/createRpcAction";

interface AuthContextValue {
  isAuthenticated: () => boolean;
  username: () => string | null;
  login: (username: string, password: string) => Promise<void>;
  logoff: () => Promise<void>;
  pending: Accessor<boolean>;
  error: () => string | null;
}

const AuthContext = createContext<AuthContextValue>();

export const AuthProvider: ParentComponent = (props) => {
  const [isAuthenticated, setIsAuthenticated] = createSignal(false);
  const [username, setUsername] = createSignal<string | null>(null);

  // The pending + error choreography is owned by createRpcAction; the success
  // step runs inside so auth state is set only on success. `login` stays void —
  // no caller branches on a result — so the fn returns `true` to keep the
  // undefined-failure sentinel clean (see createRpcAction).
  const loginAction = createRpcAction(
    async ({ user, password }: { user: string; password: string }) => {
      await backendRpc.auth.login(user, password);
      setIsAuthenticated(true);
      setUsername(user);
      return true;
    },
    { fallbackError: "Login failed" },
  );

  const login = async (user: string, password: string): Promise<void> => {
    await loginAction.run({ user, password });
  };

  // NOT routed through createRpcAction: the finally must clear auth even when the
  // RPC fails — a failed logoff still logs you out locally (see ADR-0005).
  const logoff = async () => {
    try {
      await backendRpc.auth.logoff();
    } finally {
      setIsAuthenticated(false);
      setUsername(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        username,
        login,
        logoff,
        pending: loginAction.pending,
        error: loginAction.error,
      }}
    >
      {props.children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
