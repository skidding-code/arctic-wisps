# arctic-wisps

Public list of health-checked [wisp](https://github.com/MercuryWorkshop/wisp-protocol) endpoints, consumed by the **static** and **singlefile** builds of arctic.

`wisp.txt` is a newline-delimited list of `wss://` endpoints. Blank lines and `#` comments are ignored. Every endpoint ends with a trailing slash (required by the wisp-js client — without it the client silently speaks a different, legacy protocol).

## How it works

`health-check.mjs` reads candidate endpoints from `wisp.seed.txt`, opens a WebSocket to each, and keeps only those that answer with a valid wisp v1 `CONTINUE` packet on stream 0 within the timeout. Endpoints that merely accept the socket but never speak wisp are dropped. The survivors, sorted fastest-first, are written to `wisp.txt`.

```bash
npm install
npm run check
```

## Refresh cadence

A GitHub Action re-runs the health check on a schedule and commits any change to `wisp.txt`. The arctic static client fetches this file with a short cache-busting query and falls over through the list, so a stale entry is self-correcting on the client and gets pruned here on the next run.

## Consuming it

The client fetches the **raw** file (5-minute CDN TTL) with a cache-buster, then falls back to a build-time bundled copy if the network blocks raw GitHub:

```
https://raw.githubusercontent.com/<owner>/arctic-wisps/main/wisp.txt
```

## Notes

These are third-party public endpoints operated by unaffiliated people; availability is best-effort and not guaranteed. This list contains only endpoint addresses — no scraping, harvesting, or credential tooling.
