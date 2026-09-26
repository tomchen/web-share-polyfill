// Shared by the ready-made entries (/common, /all, /simple): install the polyfill with their options, and
// a share() that uses the same ones.
import { polyfill, share as coreShare, type Options, type ShareData } from './index.js'

export type Share = (data?: ShareData, o?: Options) => Promise<string>

/** Install `navigator.share()` with `options`; return a `share()` with the same defaults (more can be added). */
export const install = (options: Options): Share => {
  polyfill(options)
  return (data, o) => coreShare(data, { ...options, ...o })
}
