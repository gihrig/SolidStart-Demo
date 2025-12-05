import { Window } from 'happy-dom'

const window = new Window({
  url: 'http://localhost',
  width: 1024,
  height: 768,
})

global.window = window as any
global.document = window.document as any
global.navigator = window.navigator as any
global.HTMLElement = window.HTMLElement as any
global.Element = window.Element as any
global.Node = window.Node as any
global.HTMLButtonElement = window.HTMLButtonElement as any
