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
- **Tests (Vitest).** Fast, TypeScript-native, no Babel config. The suite covers
  `validateData` and the `Name`/`Person` components. Tests are written to be non-flaky by
  construction: no network (the fetch hook is mocked), no timers, no randomness, no DOM
  (components render with `renderToStaticMarkup`), and `retry: 0` so a flaky test fails
  instead of hiding. They were also run 20 times with shuffled order, with no failures.
  `cachingFetch.ts` is deliberately not tested here: it is the subject of Task 2.
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

## Known issues and next steps

**Not verified**

- The Docker image has not been built by the author (no Docker on that machine). A first
  build by the reviewer caught a lockfile problem under npm 10, now fixed (see the esbuild
  commit); the image has since been verified only up to `npm ci` + build + serve under npm 10.
- CI has not run yet: the repo has no remote. Workflow steps were run locally from a clean
  checkout. Lesson learned: do that with the same Node/npm as CI (Node 20 / npm 10), which is
  what `.nvmrc` pins.

**Dependency findings (`npm audit`)**

- `fastify@4` (high: memory-allocation DoS, `find-my-way` HTTP/2 DoS) and `valibot@0.30`
  (moderate) are part of the provided framework, and the fixes are major upgrades (Fastify 5,
  valibot 1.x). I did not upgrade them as part of repo setup: it changes the framework the
  tasks are built on. The exposure here is low (GET routes, mock data, no HTTP/2). Plan:
  upgrade each in its own PR, then make the `audit` job blocking.
- `esbuild` was bumped to 0.28, which clears its advisory. The bump was needed anyway:
  vitest 4's vite requires `esbuild ^0.27 || ^0.28`, and a mismatch made `npm ci` fail on
  npm 10.
- The tooling I added (vitest, lint-staged) was kept on patched versions.
  `lint-staged` is on v16 because v17 requires Node ≥ 22.22, which conflicts with the Node 20
  pin.

**Temporary exclusions (to remove with Task 2)**

- `caching-fetch-library/cachingFetch.ts` is excluded from ESLint and Prettier while it is
  still the unimplemented stub (it has unused parameters). Both exclusions are marked
  `TODO(task-2)`.

**Would add with more time**

- A real deploy step: push the image to a registry and roll out to the chosen platform, with
  environment promotion and a health-check endpoint.
- CodeQL / secret scanning, coverage reporting with a threshold, a PR template and
  CODEOWNERS, and branch protection requiring the `verify` job.
- Stricter, type-aware ESLint presets once the codebase warrants the cost.
- Replace the hard-coded API URL and port in the app and server with configuration.
- Integration tests against the running server, once Task 2 makes the SSR routes work.
- Pin GitHub Actions to commit SHAs (Dependabot can then keep them current).
