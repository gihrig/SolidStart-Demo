import { describe, it, expect, afterEach } from "vite-plus/test";
import { focusRouteContent, ROUTE_CONTENT_ID } from "./routeContent";

// A Site menu link choice gives focus to the first item in the route content
// that takes focus, else to the toggle button (#248).
describe("focusRouteContent", () => {
  const fallback = document.createElement("button");

  function setup(html: string) {
    const root = document.createElement("div");
    root.id = ROUTE_CONTENT_ID;
    root.innerHTML = html;
    document.body.append(fallback, root);
    return (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  }

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("gives focus to the first Tab stop, past a disabled control and text", () => {
    const control = setup(`
      <p>text</p>
      <button id="off" type="button" disabled>off</button>
      <a id="first" href="/x">first</a>
      <button id="second" type="button">second</button>`);
    focusRouteContent(fallback);
    expect(document.activeElement).toBe(control("first"));
  });

  it("skips an item that refuses focus, as a hidden item does in a browser", () => {
    const control = setup(`
      <button id="refuses" type="button">refuses</button>
      <button id="next" type="button">next</button>`);
    control("refuses").focus = () => {};
    focusRouteContent(fallback);
    expect(document.activeElement).toBe(control("next"));
  });

  it("gives focus to the fallback when the route content has no Tab stop", () => {
    setup(`<main><h1>About</h1><p>text</p></main>`);
    focusRouteContent(fallback);
    expect(document.activeElement).toBe(fallback);
  });

  it("gives focus to the fallback when no route content is in the page", () => {
    document.body.append(fallback);
    focusRouteContent(fallback);
    expect(document.activeElement).toBe(fallback);
  });
});
