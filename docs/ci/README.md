# CI templates (not active)

GitHub Actions is **switched off on purpose** until the app is working end to end (owner decision, 2026-10-25). These files live outside `.github/` so GitHub does not run them.

To turn CI on later, move them back and commit:

```bash
git mv docs/ci/ci.yml.template .github/workflows/ci.yml
git mv docs/ci/dependabot.yml.template .github/dependabot.yml
```

Review the jobs first (they were written for the Phase 1 scaffold: lint, types, unit + e2e, migrations on PostGIS, Docker build, OpenAPI breaking-change check, secret and dependency audit) and add an integration-test job with Postgres and Redis service containers once `pnpm test:int` exists.

Everything the pipeline runs is also runnable locally (`pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, `docker build .`), so nothing is lost while CI is off.
