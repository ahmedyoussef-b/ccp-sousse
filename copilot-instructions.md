# Copilot instructions for CCP repository

Purpose: quick, repository-specific guidance for Copilot sessions (build/test/lint commands, high-level architecture, and key conventions).

---

## Quick commands
- Dev server: `npm run dev` (Next.js dev on port 3000).
- Build: `npm run build` (production Next build). Start prod server: `npm run start`.
- Lint: `npm run lint` (runs `next lint`). Note: Next config currently ignores ESLint during build.
- Type-check: `npm run typecheck` (`tsc --noEmit`).
- Tests (Vitest): `npm run test` (runs `vitest run`).
  - Run a single test file: `npx vitest run src/path/to/file.test.ts` or via npm: `npm run test -- src/path/to/file.test.ts`.
  - Run tests by name: `npx vitest run -t "pattern"` (match test title).
- Dev/utility scripts:
  - `npm run industrial-vision` — runs TS CLI for industrial vision tooling (requires ts-node).
  - `npm run ollama:*` — scripts for Ollama integration (ts-node scripts).

---

## High-level architecture (big picture)
- This is a Next.js (app) repository focused on vision + AI services. The front-end and server routes live under `src/` and expose REST APIs under `/api/*` (e.g., `/api/vision`, `/api/industrial-vision`, `/api/chat`, `/api/training`, `/api/documents`).
- Major areas:
  - `src/ai/` — core AI modules: RAG, providers (Ollama, cohere, etc.), caching, orchestration, agents, and vector store integration (ChromaDB).
  - `src/lib/` — platform services (vision orchestration, integrations, utilities).
  - `src/components/` — UI components and visual pages (`/vision`, `/industrial-vision`, `/admin`, `/training`, etc.).
  - `scripts/` — developer CLI helpers (Ollama management, watch uploads).
  - `data/`, `chroma_data/` — persistent data/embeddings and caches used in development.
- The app depends on several native or server-only packages (`@tensorflow/tfjs-node`, `chromadb`, `sharp`, etc.) and Next config includes `serverExternalPackages` and webpack fallbacks to avoid bundling them into the client.

---

## Key repo conventions and gotchas
- TypeScript:
  - `paths` aliases in `tsconfig.json`: `@/*` -> `src/*`, and scoped aliases (`@/ai/*`, `@/components/*`, `@/lib/*`) are used throughout. Prefer these aliases when adding imports.
  - `strict: true`, `noEmit: true`. Use `npm run typecheck` to validate locally.
- Tests:
  - Vitest is configured to run `src/**/*.test.ts` in a Node environment (see `vitest.config.ts`). Coverage excludes some AI provider files.
  - Use `npx vitest` for quick local runs; the codebase includes `@vitest/ui` as a dev dependency.
- Client/server split:
  - Next.js webpack config deliberately aliases server-only modules to `false` to prevent client bundling. When adding server-only dependencies, add them to `next.config.js` `serverExternalPackages` as needed and ensure code runs only server-side (API routes, server components, or getServerSideProps equivalents).
- Build-time tolerances:
  - `next.config.ts` currently sets `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds` to `true`. CI or release processes may want stricter checks (override these if enforcing quality gates).
- Dev tooling:
  - Several scripts use `ts-node` and `tsconfig-paths`. When running those locally, ensure `ts-node` is installed and node native modules (e.g., `sharp`, `@tensorflow/tfjs-node`) are available or mocked.
- Native modules & Docker/CI:
  - Packages such as `sharp` and `@tensorflow/tfjs-node` may require native build steps. CI should install required system libraries or use dedicated containers.
- Data and secrets:
  - Embeddings and ChromaDB data are stored under `chroma_data/`. Do not commit large data files. Use environment variables (dotenv) for credentials — `.env` handling is expected.

---

## Files to check when onboarding
- `README.md` — high-level features and endpoints summary (already contains useful module mapping).
- `vitest.config.ts` — test patterns and coverage exclusions.
- `next.config.ts` — server/client bundling decisions and allowed server packages.
- `tsconfig.json` — path aliases and TypeScript options.

---

## AI-assistant config files
- No CLAUDE.md, .cursorrules, AGENTS.md, .windsurfrules, CONVENTIONS.md, or similar assistant-specific files were found at scan time. If any exist later, incorporate their important parts here.

---

If anything above should be adjusted (more detail on CI, Docker, or how to run a local ChromaDB instance), say which area to expand and it will be added.
