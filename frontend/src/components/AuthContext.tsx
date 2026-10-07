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

// The authenticated current user: session state plus the nav-avatar identity
// (`displayName` / `avatarUrl`). The identity is the logged-in User's back-end
// profile (#119), read behind this unchanged interface (ADR-0007).
interface AuthContextValue {
  isAuthenticated: () => boolean;
  username: () => string | null;
  login: (username: string, password: string) => Promise<void>;
  logoff: () => Promise<void>;
  pending: Accessor<boolean>;
  error: () => string | null;
  /** The logged-in User's profile name (the login username while it loads);
   *  undefined when logged out. */
  displayName: Accessor<string | undefined>;
  /** The logged-in User's avatar; undefined when logged out, still loading, or
   *  when the User has none (an empty `SafeUrl`). */
  avatarUrl: Accessor<SafeUrl | undefined>;
  /** The logged-in User's id, from the same profile (#123); undefined when
   *  logged out, still loading, or when the profile fails. The Jedi route uses
   *  it to show Edit / Delete to the Owner only. This only hides buttons; the
   *  back-end owns enforcement. */
  userId: Accessor<number | undefined>;
}

const AuthContext = createContext<AuthContextValue>();

export const AuthProvider: ParentComponent = (props) => {
  const [isAuthenticated, setIsAuthenticated] = createSignal(false);
  const [username, setUsername] = createSignal<string | null>(null);

  // Nav identity (ADR-0007, #119): the logged-in User's profile. `get_profile`
  // needs a login, so the source is the login username — no fetch while logged
  // out, and a new fetch per login. The fetcher logs and absorbs a failure:
  // AuthProvider sits above every error boundary, so a thrown profile error would
  // crash the app, while a missing profile only falls back to the username.
  // `.latest` is a non-suspending read — the nav reads it outside <Suspense>.
  const [profile, { mutate: setProfile }] = createResource(
    () => (isAuthenticated() ? username() : undefined),
    () =>
      jediApi.profile.get().catch((err: unknown) => {
        console.warn("[AuthContext] Profile load failed:", err);
        return undefined;
      }),
  );
  const displayName = () =>
    isAuthenticated() ? (profile.latest?.name ?? username() ?? undefined) : undefined;
  const avatarUrl = () => (isAuthenticated() ? profile.latest?.avatarUrl : undefined);
  const userId = () => (isAuthenticated() ? profile.latest?.id : undefined);

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
      // Drop the logged-off User's profile, so a next login never shows it.
      setProfile(undefined);
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
        userId,
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
