import { Title } from "@solidjs/meta";
import { Show, type Accessor } from "solid-js";
import { createConversationWorkspace } from "~/lib/conversationWorkspace";
import { AuthProvider, useAuth } from "~/components/AuthContext";
import LoginForm from "~/components/LoginForm";
import WorkspaceLayout from "~/components/WorkspaceLayout";

interface AuthenticatedWorkspaceProps {
  username: Accessor<string | null>;
  onLogoff: () => void;
}

// The workspace and its list resources are created here, under the authenticated
// boundary, so they only ever fetch once a session exists — never firing an
// unauthenticated request that 401s and crashes the render. Logging out unmounts
// this subtree, disposing the selection for free.
function AuthenticatedWorkspace(props: AuthenticatedWorkspaceProps) {
  const ws = createConversationWorkspace();

  return (
    <>
      <div class="mx-auto mb-4 flex max-w-6xl items-center justify-between">
        <span class="text-(--theme-muted)">Logged in as: {props.username()}</span>
        <button onClick={props.onLogoff} class="theme-button">
          Logout
        </button>
      </div>

      <WorkspaceLayout ws={ws} />
    </>
  );
}

function FullstackContent() {
  const { isAuthenticated, username, logoff } = useAuth();

  return (
    <main class="container mx-auto p-4">
      <h1>Full-Stack Integration Demo</h1>
      <p class="mb-4 text-center! text-(--theme-muted)">
        SolidStart + Rust/Axum JSON-RPC Example (with WebSocket real-time updates)
      </p>

      <Show when={!isAuthenticated()}>
        <div class="mx-auto max-w-md">
          <LoginForm />
        </div>
      </Show>

      <Show when={isAuthenticated()}>
        <AuthenticatedWorkspace username={username} onLogoff={() => void logoff()} />
      </Show>
    </main>
  );
}

export default function Fullstack() {
  return (
    <AuthProvider>
      <Title>Full-Stack Demo | SolidStart+</Title>
      <div class="demo">
        <FullstackContent />
      </div>
    </AuthProvider>
  );
}
