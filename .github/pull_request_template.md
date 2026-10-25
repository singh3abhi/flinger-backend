## What and why

<!-- One or two sentences. Link the requirement IDs (e.g. FR-AUTH-01) this delivers. -->

## Checklist

- [ ] Lint, types, unit and e2e tests pass locally
- [ ] New logic has tests at the lowest sensible level (bug fixes include a regression test)
- [ ] If an endpoint or DTO changed: ran `pnpm openapi:build` and reviewed the `openapi/openapi.json` diff
- [ ] No breaking change inside `/v1` (additive only)
- [ ] If the schema changed: migration committed and backward compatible (expand, then contract)
- [ ] No secrets, OTPs, tokens, phone numbers or message text in logs; no `console.log`
- [ ] Docs or an ADR updated if a decision changed
