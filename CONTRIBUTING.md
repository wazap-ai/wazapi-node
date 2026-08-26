# Contributing

## The types mirror the API contract by hand

`src/types.ts` is a hand-written mirror of the Wazapi Public API v1 OpenAPI
contract, served at <https://wazapi.io/api/openapi/v1.json>. Nothing generates
it and nothing checks it — if the contract changes and this file does not, the
package ships types that lie, and TypeScript will confidently accept code that
fails at runtime.

**So: any change to the API contract needs a matching PR here.** When you touch
the spec on the API side, open the SDK PR in the same batch, not "later".

Worth checking against the live contract before a release:

```bash
curl -s https://wazapi.io/api/openapi/v1.json | jq '.components.schemas | keys'
```

## Local development

```bash
npm install          # no pnpm workspace here — this package stands alone
npm test             # builds, then runs node:test against dist/
npm run build
```

Zero runtime dependencies is a deliberate constraint — the package uses the
native `fetch` from Node 18+. Please do not add one.

## Releasing

1. Bump `version` in `package.json` (additive contract change = minor).
2. `npm test`
3. `npm publish` — needs a Classic **Automation** token; a *Publish* token
   still hits `EOTP` under the org's 2FA.
