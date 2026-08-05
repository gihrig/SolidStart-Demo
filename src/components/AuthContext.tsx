import {
  createContext,
  useContext,
  createSignal,
  createResource,
  type Accessor,
  type ParentComponent,
} from "solid-js";
import { backendRpc } from "~/lib/backend-rpc";
import { createRpcAction } from "~/lib/createRpcAction";
import { jediApi } from "~/lib/jedi/jedi-api";
import type { SafeUrl } from "~/lib/sanitizeUrl";

// The authenticated current user: session state plus the interim nav-avatar
// identity (`displayName` / `avatarUrl`). The two identity accessors blend the
// login with the Jedi mock profile today; #17 unifies them behind one back-end
// (see ADR-0007), which keeps this interface but swaps the avatar's source.
interface AuthContextValue {
  isAuthenticated: () => boolean;
  username: () => string | null;
  login: (username: string, password: string) => Promise<void>;
  logoff: () => Promise<void>;
  pending: Accessor<boolean>;
  error: () => string | null;
  /** Login username once authenticated, else the Jedi mock profile name. */
  displayName: Accessor<string | undefined>;
  /** The Jedi mock profile avatar — interim until #17 supplies the user's own. */
  avatarUrl: Accessor<SafeUrl | undefined>;
}

const AuthContext = createContext<AuthContextValue>();

export const AuthProvider: ParentComponent = (props) => {
  const [isAuthenticated, setIsAuthenticated] = createSignal(false);
  const [username, setUsername] = createSignal<string | null>(null);

  // Interim nav identity (ADR-0007): the display name is the login username once
  // authenticated, else the Jedi mock profile name; the avatar is always the mock
  // until #17 returns the authenticated user's own. `.latest` is a non-suspending
  // read — AuthProvider sits above <Suspense> and the nav reads these outside it,
  // so a suspending read would stall the whole tree.
  const [profile] = createResource(() => jediApi.profile.get());
  const displayName = () => (isAuthenticated() ? (username() ?? undefined) : profile.latest?.name);
  const avatarUrl = () => profile.latest?.avatarUrl;

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
        displayName,
        avatarUrl,
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
