import { useDisclosure } from "~/lib/useDisclosure";
import type { ConversationWorkspace } from "~/lib/conversationWorkspace";
import ConversationTree from "~/components/ConversationTree";
import MessagePanel from "~/components/MessagePanel";

export interface WorkspaceLayoutProps {
  ws: ConversationWorkspace;
}

/**
 * Assembles the two-pane workspace. Desktop/tablet: a centered, max-width grid
 * with the navigator and Messages at a 1:3 ratio, both scaling with the
 * viewport. Mobile: the navigator collapses into a disclosure drawer (toggle,
 * Escape-to-dismiss, `inert` when closed) so the Messages stay primary;
 * selecting a Conversation closes the drawer.
 */
export default function WorkspaceLayout(props: WorkspaceLayoutProps) {
  const drawer = useDisclosure({ id: "conversation-navigator" });

  const closeDrawerIfOpen = () => {
    if (drawer.open()) drawer.toggle();
  };

  return (
    <div class="mx-auto max-w-6xl">
      {/* Mobile-only drawer toggle, labelled for what it reveals. */}
      <button
        type="button"
        aria-label="Conversations"
        {...drawer.triggerProps}
        class="theme-button mb-4 flex items-center gap-2 md:hidden"
      >
        <span aria-hidden="true">{drawer.open() ? "▾" : "▸"}</span>
        Conversations
      </button>

      <div class="grid gap-6 md:grid-cols-4">
        {/* Navigator: a drawer on mobile (hidden + inert when closed), a fixed
            pane on desktop (always shown, never inert). */}
        <div
          {...drawer.panelProps}
          class={`md:col-span-1 md:block ${drawer.open() ? "block" : "hidden"}`}
        >
          <div class="card-style p-4">
            <ConversationTree ws={props.ws} onConversationSelected={closeDrawerIfOpen} />
          </div>
        </div>

        <div class="card-style p-4 md:col-span-3">
          <MessagePanel conv={props.ws.selectedConv()} />
        </div>
      </div>
    </div>
  );
}
