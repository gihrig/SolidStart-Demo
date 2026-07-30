import { createSignal, type Accessor } from "solid-js";

/**
 * A single async mutation with its own pending + error signals. Owns the
 * reset-error → set-pending → try / catch / finally choreography shared by
 * every "fire an RPC, reflect its progress and failure" handler — and nothing
 * else. The caller supplies the operation (RPC plus any success step) and its
 * fallback error text; the success step runs *inside* the wrapped fn so its
 * rejections land in `error` and still clear `pending` in `finally`.
 */
export interface RpcAction<TArgs, TResult> {
  /**
   * Runs the operation; resolves the result on success, `undefined` on failure.
   * `undefined` is the failure sentinel — don't wrap an `fn` whose success value
   * can itself be `undefined`, or a legitimate success reads as a failure.
   */
  run: (args: TArgs) => Promise<TResult | undefined>;
  pending: Accessor<boolean>;
  error: Accessor<string | null>;
}

export function createRpcAction<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  opts: { fallbackError?: string } = {},
): RpcAction<TArgs, TResult> {
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const fallbackError = opts.fallbackError ?? "Action failed";

  const run = async (args: TArgs): Promise<TResult | undefined> => {
    setError(null);
    setPending(true);
    try {
      return await fn(args);
    } catch (e) {
      setError(e instanceof Error ? e.message : fallbackError);
      return undefined;
    } finally {
      setPending(false);
    }
  };

  return { run, pending, error };
}
