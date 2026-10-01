/** Script-tag build: installs the polyfill and exposes the API as `window.WebSharePolyfill`. */
import { polyfill } from './full.js'
import './legacy.js'

export * from './full.js'

polyfill()
