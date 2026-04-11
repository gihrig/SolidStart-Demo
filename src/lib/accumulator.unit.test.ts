import { describe, test, expect } from "vite-plus/test";
import { createAccumulator } from "./accumulator";

describe("createAccumulator", () => {
  test("initializes with default value of 0", () => {
    const [value] = createAccumulator();
    expect(value()).toBe(0);
  });

  test("initializes with custom value", () => {
    const [value] = createAccumulator(10);
    expect(value()).toBe(10);
  });

  test("accumulates positive values", () => {
    const [value, accumulate] = createAccumulator();

    const result1 = accumulate(5);
    expect(result1).toBe(5);
    expect(value()).toBe(5);

    const result2 = accumulate(3);
    expect(result2).toBe(8);
    expect(value()).toBe(8);
  });

  test("accumulates negative values", () => {
    const [value, accumulate] = createAccumulator(10);

    accumulate(-3);
    expect(value()).toBe(7);

    accumulate(-2);
    expect(value()).toBe(5);
  });

  test("handles zero changes", () => {
    const [value, accumulate] = createAccumulator(5);

    accumulate(0);
    expect(value()).toBe(5);
  });

  test("maintains independent state across instances", () => {
    const [value1, accumulate1] = createAccumulator();
    const [value2, accumulate2] = createAccumulator();

    accumulate1(5);
    accumulate2(10);

    expect(value1()).toBe(5);
    expect(value2()).toBe(10);
  });

  test("signal updates are reactive", () => {
    const [value, accumulate] = createAccumulator(0);
    const readings: number[] = [];

    // Simulate tracking the signal
    readings.push(value());
    accumulate(1);
    readings.push(value());
    accumulate(2);
    readings.push(value());

    expect(readings).toEqual([0, 1, 3]);
  });

  test("handles large numbers", () => {
    const [value, accumulate] = createAccumulator(1000000);

    accumulate(500000);
    expect(value()).toBe(1500000);
  });

  test("handles decimal values", () => {
    const [value, accumulate] = createAccumulator(0.1);

    accumulate(0.2);
    expect(value()).toBeCloseTo(0.3, 10);
  });
});
