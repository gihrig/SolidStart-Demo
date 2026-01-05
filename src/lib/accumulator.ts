import { createSignal, Accessor } from "solid-js";

// Return both value accessor and accumulator function
// Initial value of `0` established number type for accumulator
export function createAccumulator(initial = 0) {
  const [value, setValue] = createSignal(initial);

  const accumulate = (change: number) => {
    setValue(prev => prev + change);
    return value();
  };

  return [value, accumulate] as const;
}
