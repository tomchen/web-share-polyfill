# TODO

## Before the first release

- npm: create a granular access token with publish rights on npmjs.com and save it as the `NPM_TOKEN`
  secret of the GitHub repo (Settings → Secrets and variables → Actions). After the first publish, switch
  to trusted publishing (package settings → Trusted publisher → GitHub Actions, workflow `release.yml`)
  and remove the secret.
- Then `bun run release minor` (0.1.0): vbt runs `bun run check`, bumps, tags and pushes; the Release
  workflow publishes.
- Delete `tomchen/web-share-test` (it only ran `scripts/probe.mjs` before this repo existed; the "Browser
  support" workflow here does the same now).

## Notes

- Sizes are measured with Bun's zlib, about 1% smaller than Node's; the README table uses them.
