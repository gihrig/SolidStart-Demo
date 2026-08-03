import { Title } from "@solidjs/meta";
import { Show, type Accessor } from "solid-js";
import { createConversationWorkspace } from "~/lib/conversationWorkspace";
import { AuthProvider, useAuth } from "~/components/AuthContext";
import LoginForm from "~/components/LoginForm";
import ConversationTree from "~/components/ConversationTree";
import MessagePanel from "~/components/MessagePanel";

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
      <div class="mb-4 flex items-center justify-between">
        <span class="text-green-600">Logged in as: {props.username()}</span>
        <button
          onClick={props.onLogoff}
          class="rounded bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
        >
          Logout
        </button>
      </div>

      {/* Interim two-pane layout; the responsive 1:3 grid + mobile drawer land in #52. */}
      <div class="grid gap-6 md:grid-cols-3">
        <div class="card-style p-4 md:col-span-1">
          <ConversationTree ws={ws} />
        </div>

        <div class="card-style p-4 md:col-span-2">
          <MessagePanel conv={ws.selectedConv()} />
        </div>
      </div>
    </>
  );
}

function FullstackContent() {
  const { isAuthenticated, username, logoff } = useAuth();

  return (
    <main class="container mx-auto p-4">
      <h1>Full-Stack Integration Demo</h1>
      <p class="mb-4 text-center! text-gray-400">
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
