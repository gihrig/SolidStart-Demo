/** Whether a key event belongs to an IME composition, so a key handler must
 *  leave it to the browser (#246, #251). Safari can send the Enter that
 *  confirms a composed character with `isComposing === false` and
 *  `keyCode === 229` (WebKit bug 165004). */
export function isImeKey(e: KeyboardEvent): boolean {
  return e.isComposing || e.keyCode === 229;
}
