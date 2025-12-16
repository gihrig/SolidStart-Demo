declare module '*.mdx' {
  import { Component } from 'solid-js';
  const MDXComponent: Component<Record<string, any>>;
  export default MDXComponent;
}

// Override the problematic @types/mdx JSX namespace
declare global {
  namespace JSX {
    // This tells @types/mdx to use SolidJS's JSX types
    type Element = import('solid-js').JSX.Element;
    type IntrinsicElements = import('solid-js').JSX.IntrinsicElements;
    interface ElementClass {
      render(props: any): import('solid-js').JSX.Element;
    }
  }
}

export { };
