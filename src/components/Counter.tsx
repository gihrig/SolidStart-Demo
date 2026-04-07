import { createSignal } from "solid-js";

export default function Counter() {
  const [count, setCount] = createSignal(0);
  return (
    <button
      type="button"
      class="dark: w-[200px] rounded-full border-2 border-gray-400 bg-gray-800 px-8 py-4 text-stone-100 focus:border-white active:border-gray-400 dark:bg-zinc-700 dark:text-stone-300 dark:focus:border-gray-300"
      onClick={() => setCount(count() + 1)}
    >
      Clicks: {count()}
    </button>
  );
}
