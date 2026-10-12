# People Directory – repository setup

A small React 18 SSR app served by Fastify, with a mocked API (msw). See
[`DevTask.md`](./DevTask.md) for the assignment. This README covers **Task 1**: what was
added to make the repo production-ready, and why.

## Quick start

```bash
nvm use        # Node 20, from .nvmrc
npm ci
npm start      # builds, then serves http://localhost:3000
```

Or with Docker:

```bash
docker build -t challenge .
docker run --rm -p 3000:3000 challenge   # -p 3001:3000 if port 3000 is taken
```

| Script                      | What it does                          |
| --------------------------- | ------------------------------------- |
| `npm start`                 | Build, then run `dist/server.js`      |
| `npm run build`             | Bundle server and client with esbuild |
| `npm run lint`              | ESLint, zero warnings allowed         |
| `npm run format` / `:check` | Prettier write / verify               |
| `npm run typecheck`         | `tsc --noEmit`                        |
| `npm test`                  | Vitest, single run                    |

## What was added and why

Each item is its own commit on `chore/task1-repo-setup`, so the reasoning is easy to review.

### Repository hygiene

- **`.gitignore`; untracked `.DS_Store` and `.idea/`.** Editor and OS files and build output
  don't belong in history.
- **`package-lock.json` committed, CI uses `npm ci`.** Reproducible installs: CI and
  production resolve the same versions the author tested.
- **`.nvmrc` and `engines.node >=20`.** One documented Node version for local, CI and Docker.
  Node 20 matches `@types/node`.
- **`.editorconfig`.** Editors agree on charset, newlines and indentation before Prettier runs.
- **`package.json` fixes.** Removed a `main` pointing at a missing file, marked the package
  `private`, pointed `msw.workerDirectory` at the real directory (`framework/mock-server`; the
  old value made msw's postinstall generate a stray `mockServer/` folder), and used real
  `.ts`/`.tsx` esbuild entry points (the `.js` ones only worked by accident of resolution).

### Quality gates

- **Type-check (`tsc --noEmit`).** esbuild strips types without checking them, so without this
  there is no type gate at all. `typescript` was not a dependency, so it was added.
- **Prettier (defaults).** Formatting is not worth debating; defaults mean zero config to
  maintain. The repo already had Prettier configured in WebStorm (`.idea/prettier.xml`), so
  this matches the author's tooling. Applied to existing code in one isolated `style:` commit
  so it can be reviewed or reverted on its own.
- **ESLint 9 flat config** with `typescript-eslint` recommended, `react` and `react-hooks`,
  and `--max-warnings 0`. The `recommended` presets catch real bugs without the noise or slow
  type-aware linting of the `strict`/`type-checked` presets. ESLint and Prettier are kept
  separate: ESLint finds problems, Prettier formats.
- **Tests (Vitest).** Fast, TypeScript-native, no Babel config. 19 tests in four files:
  `validateData` (valid, empty, missing field, wrong type, non-array), the `Name`/`Person`
  components (details at the right index, loading, error), and the caching library plus its
  server-side acceptance criteria (see Task 2). Tests are written to be non-flaky by construction: no network (the fetch hook is
  mocked in component tests, `fetch` is stubbed in library tests), no timers, no randomness,
  no DOM (components render with `renderToStaticMarkup`), and `retry: 0` so a flaky test
  fails instead of hiding. They were also run repeatedly with shuffled order, with no
  failures.
- **Pre-commit hook (husky + lint-staged).** ESLint and Prettier on staged files only, for
  fast local feedback. It is a convenience, not the gate: CI is the gate, because hooks can be
  skipped. `prepare` is `husky || true` so installs without devDependencies (Docker,
  production) don't fail.

### CI/CD (`.github/workflows/ci.yml`)

Runs on pull requests and pushes to `main`, with least-privilege permissions
(`contents: read`) and cancellation of superseded runs.

- **`verify`**: `npm ci`, lint, format check, typecheck, test, build. One job, because the
  steps are cheap and sharing one install is faster than parallel jobs that each reinstall.
- **`docker`**: builds the image (no push) so a broken Dockerfile is caught in review.
- **`audit`**: `npm audit --omit=dev --audit-level=high`, **non-blocking**
  (`continue-on-error`). See [Known issues](#known-issues-and-next-steps).
- **Dependabot**: weekly updates for npm (minor/patch grouped) and GitHub Actions.

**Deployment (CD) is not configured.** The brief names no hosting target, so I did not guess
one. The Docker image is the deployable artifact; the missing step is "push to a registry and
roll out to the chosen platform" (see next steps).

### Docker

Multi-stage `node:20-alpine`: the build stage installs and bundles; the runtime stage copies
only `dist/` (esbuild bundles all dependencies, which I verified runs without `node_modules`),
runs as the non-root `node` user and exposes port 3000. The server binds to `localhost` by default, which is unreachable through a published
port, so the image sets `HOST=0.0.0.0`. `framework/server/index.ts` reads `HOST` for this
(the only framework change in this branch; the default behaviour is unchanged). `.dockerignore` keeps the context small.

> This image is for demonstrating the challenge app. It bundles msw and serves mocked data,
> so it is not a production deployment of a real service.

## Task 2: caching fetch library (`caching-fetch-library/cachingFetch.ts`)

Module-level `Map<url, {data, error, promise}>`. Only the file above changed (plus removing
the temporary lint/format exclusions).

- **One request for many callers.** `useCachingFetch` is called from `App`, every `Person` and
  every `Name`. The first call stores the in-flight promise; later calls for the same URL reuse
  it, so there is a single network request. Hooks re-render through a small listener set when a
  request settles.
- **No fetch during SSR.** The hook only fetches inside `useEffect`, which never runs in
  `renderToString`. On `/appWithoutSSRData` the server renders "Loading..." and the browser
  fetches once, hydrating with the same initial state (no mismatch).
- **`preloadCachingFetch`** awaits the same fetch on the server, so the later render finds data
  synchronously. A failed preload does not 500 the page: failed entries are not serialized, so
  the browser renders Loading and retries.
- **Serialization.** `serializeCache` emits `encodeURIComponent(JSON)` with `'` also escaped.
  The framework pastes the string into a single-quoted `<script>` literal without escaping, so
  raw JSON containing `'`, `\` or `</script>` would break the page or allow script injection.
  `initializeCache` reverses it. `wipeCache` clears the map (the framework calls it per request).
- **Unit tests** (`cachingFetch.test.tsx`, 6): concurrent preloads make one fetch; preloaded
  data reaches the hook synchronously; failed or non-2xx preloads don't throw and aren't
  serialized; the hook doesn't fetch during server rendering; the serialized string is safe
  for the framework's single-quoted script literal (no `'`, `"`, `\`, `<`, `>` or
  whitespace); `wipeCache` empties the cache.
- **Acceptance tests** (`acceptance.test.tsx`, 2): the real `<App />` and the framework's own
  `renderApp`/`buildHtmlDoc`, with only `fetch` stubbed. (1) The server HTML contains every
  person, with no "Loading...", from a single request (the JS-off criterion). (2) The
  `<script>` the server emits is run as a browser would, then the app renders from that cache
  with zero API calls. The test data contains `O'Brien` and a `</script>` string, so the
  handoff only passes if serialization really survives the framework's unescaped embedding.
  Breaking the `'` escape or the preload makes these fail. The browser-only criterion (exactly
  one request from `useEffect` while hydrating) is not automated and stays a manual Chrome
  check.
- **Verified** (`npm start`): without-SSR makes exactly one API request and renders all 300
  fields; with-SSR HTML contains the people with JS disabled, and with JS enabled makes no API
  request and logs no errors. `tsc`, ESLint, Prettier and existing tests pass.

## Known issues and next steps

**Verification status**

- CI (`verify` and `docker` jobs) passes on GitHub. The `audit` job (non-blocking) passes at the `high` level since the Fastify upgrade; see below.
- The Docker image builds and runs locally; the repo owner confirmed it serves the app on a
  mapped port. Two problems found along the way are fixed: a lockfile mismatch under npm 10
  (esbuild version) and the server binding to loopback only (`HOST`).
- Lesson learned: verify with the same Node/npm as CI (Node 20 / npm 10, pinned by
  `.nvmrc`), not the local toolchain.
- `/appWithSSRData` and `/appWithoutSSRData` now work (Task 2). Verified by hand with curl and
  Chrome DevTools against `npm start`; the Docker image has not been re-checked since.

**Dependency findings (`npm audit`)**

- `fastify` was upgraded 4.29.1 → 5.12.5 by Dependabot (PR #7), which clears the high
  advisories. I first held it back because it changes the framework the tasks are built on;
  before merging I ran the build and server locally (and with Task 2 on top) and checked
  that the routes, tests and audit were healthy. `valibot@0.30` (moderate, provided
  framework) is still on a pre-1.x release; the fix is a major upgrade, so it stays a
  separate PR. Remaining plan: upgrade it, then make the `audit` job blocking.
- `esbuild` was bumped to 0.28, which clears its advisory. The bump was needed anyway:
  vitest 4's vite requires `esbuild ^0.27 || ^0.28`, and a mismatch made `npm ci` fail on
  npm 10.
- The tooling I added (vitest, lint-staged) was kept on patched versions.
  `lint-staged` is on v16 because v17 requires Node ≥ 22.22, which conflicts with the Node 20
  pin.

**Caching library limitations**

- No expiry, invalidation or size limit: entries live until `wipeCache`. Errors are cached too,
  so a failed request is not retried until reload.
- The cache is module-global. Safe here because the framework calls `wipeCache` per request,
  but concurrent SSR requests could share or wipe each other's entries; a per-request cache
  (context) would fix it.
- Data is typed `unknown` and validated by the app, not the library. Only JSON responses are
  supported.
- Chrome logs `Uncaught (in promise)` on `/appWithoutSSRData`. The stack is entirely inside
  MSW's service-worker message handler in `client.js`, not the library; the page works. The
  console also warns that `mockServiceWorker.js` was generated by a different MSW version
  (2.3.1 vs installed); `npx msw init` would refresh it, but that is framework code.
- The framework's unescaped `window.__INITIAL_DATA__ = '...'` injection is fragile; a
  `<script type="application/json">` block would be safer.
- The hook's effect-driven client path has no automated test (needs jsdom or Playwright).

**Would add with more time**

- A real deploy step: push the image to a registry and roll out to the chosen platform, with
  environment promotion and a health-check endpoint.
- CodeQL / secret scanning, coverage reporting with a threshold, a PR template and
  CODEOWNERS, and branch protection requiring the `verify` job.
- Stricter, type-aware ESLint presets once the codebase warrants the cost.
- Replace the hard-coded API URL and port in the app and server with configuration.
- Integration tests against the running server, and a DOM-level test of the hook.
- Pin GitHub Actions to commit SHAs (Dependabot can then keep them current).
