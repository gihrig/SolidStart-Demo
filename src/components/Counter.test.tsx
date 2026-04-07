import { describe, it, expect } from "vite-plus/test";
import { render, screen, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import Counter from "./Counter";

// Comments describe changes from Solid Start Vitest per Claude
// Post test cleanup required - see /vitest-setup.ts
describe("<Counter />", () => {
  // Separate initial render test from interaction test
  it("renders with initial count of 0", () => {
    render(() => <Counter />);
    // Use screen.getByRole() instead of queryByRole()
    // - throws descriptive error if element not found
    // Use { name: /clicks:/i } for robust button identification
    const button = screen.getByRole("button", {
      name: /clicks: 0/i,
    });
    expect(button).toHaveTextContent("Clicks: 0");
    // Verify button type attribute
    expect(button).toHaveAttribute("type", "button");
  });

  // Test multiple clicks to verify state accumulation
  it("increments count on each click", async () => {
    // Setup userEvent properly with userEvent.setup()
    const user = userEvent.setup();
    render(() => <Counter />);

    const button = screen.getByRole("button", {
      name: /clicks:/i,
    });

    await user.click(button);
    expect(button).toHaveTextContent("Clicks: 1");

    await user.click(button);
    expect(button).toHaveTextContent("Clicks: 2");

    await user.click(button);
    expect(button).toHaveTextContent("Clicks: 3");
  });

  // Test for multiple instances (component isolation)
  it("maintains independent state across multiple instances", () => {
    const { container: container1 } = render(() => <Counter />);
    const { container: container2 } = render(() => <Counter />);

    const button1 = within(container1).getByRole("button", {
      name: /clicks:/i,
    });
    const button2 = within(container2).getByRole("button", {
      name: /clicks:/i,
    });

    expect(button1).toHaveTextContent("Clicks: 0");
    expect(button2).toHaveTextContent("Clicks: 0");
  });
});
