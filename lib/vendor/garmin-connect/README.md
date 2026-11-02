# garmin-connect (vendored)

Fork of [garmin-connect](https://github.com/Pythe1337N/garmin-connect) **1.6.2** by Oskar Bernberg, MIT licence
([LICENSE](LICENSE)); unmaintained upstream since 01/2024. The files in this folder stay under the MIT licence.

Ported from the published build (`dist/`) to TypeScript and reduced to what `lib/sources/garmin-login/` uses:
`login`, `loadToken`, `exportToken`, `getUserProfile`, `getActivities`, `get`, and the HTTP client behind them (SSO
login, OAuth1 → OAuth2 exchange, automatic token refresh on 401). Requests, headers, URLs and the login flow are
unchanged. Dropped: everything else the package offers (uploads, workouts, weight, sleep, hydration, golf, downloads)
and its dependencies `lodash`, `luxon`, `qs`, `app-root-path`, `crypto` (the npm shim).

## Runmate changes (marked `Runmate:` in the code)

- **No secrets in logs.** Upstream logged the raw axios error when a token refresh failed (its request config holds
  `Authorization: Bearer …`), the full response body on every HTTP error, the SSO page title and the account status.
  All of that is gone. A failed refresh logs one fixed line with the HTTP status and a scrubbed message
  (`redact.ts`) and rethrows a `GarminConnectError` (status + scrubbed message, no config, no response).
- **Refresh state per client.** Upstream kept `isRefreshing` and the waiting requests in module variables: in a
  multi-user server one user's refreshed token could be handed to another user's waiting request, and a failed
  refresh left `isRefreshing` set so every later 401 waited forever. Both are per instance now; a failed refresh
  rejects the waiting requests.
- `handleHttpError` throws `ERROR: (status), statusText` without the body (Runmate's `client.ts` replaces it with
  `GarminHttpError` anyway).
- `URLSearchParams` instead of `qs` (same output for these flat params); `Date` instead of `luxon` for the token
  expiry (the two human-readable date strings are UTC ISO now; nothing reads them).
- Credentials are required (upstream fell back to a `garmin.config.json` file).

Tests: `tests/sources/garmin-vendor.test.ts` (refresh-error path with a mocked HTTP adapter, no secret in the console
output or the thrown error).
