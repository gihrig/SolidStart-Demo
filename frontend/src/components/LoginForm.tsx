import { Show } from "solid-js";
import { useAuth } from "./AuthContext";

export interface LoginFormProps {
  /** Runs after a login that authenticated; a failed login leaves the form as is. */
  onSuccess?: () => void;
  /** The heading's id, so a wrapping dialog can take its name from it. */
  headingId?: string;
  /** Shows a Cancel button that runs this; it is disabled while the login is in flight. */
  onCancel?: () => void;
}

export default function LoginForm(props: LoginFormProps) {
  const { login, pending, error, isAuthenticated } = useAuth();

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    await login(formData.get("username") as string, formData.get("password") as string);
    // `login` never rejects; a failure shows as `error`, so check the outcome.
    if (isAuthenticated()) props.onSuccess?.();
  };

  return (
    <form onSubmit={handleSubmit} class="space-y-4">
      <h2 id={props.headingId} style="margin-left:0;">
        Login
      </h2>

      <Show when={error()}>
        <div class="rounded bg-red-100 p-2 text-red-700">{error()}</div>
      </Show>

      <div>
        <label for="username" class="block text-sm font-medium">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          required
          class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>

      <div>
        <label for="password" class="block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          class="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>

      <div class="flex justify-end gap-2">
        <Show when={props.onCancel}>
          <button
            type="button"
            disabled={pending()}
            onClick={() => props.onCancel?.()}
            class="theme-button disabled:opacity-50"
          >
            Cancel
          </button>
        </Show>
        <button
          type="submit"
          disabled={pending()}
          class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending() ? "Logging in..." : "Login"}
        </button>
      </div>
    </form>
  );
}
