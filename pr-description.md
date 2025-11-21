## Related Issue

Closes #0 (tracking CLI refactor cleanup)

## What

- Remove the unused `SqlAgent` implementation until NL-to-SQL is ready, per request.
- Add a CLI README covering global installation (so `qwery` runs without `node` wrappers) and the Angry Star smoke test commands.
- Make CLI table output serialize nested objects so datasource/notebook rows show real data instead of `[Object]`.

## How

- Deleted `apps/cli/src/services/sql-agent.ts` and staged the removal.
- Added `apps/cli/README.md` with build, global linking, uninstall steps, and a full walkthrough for `postgresql://postgres:YUX5he1NC3cn@angry-star-sooomu.us-west-aws.db.guepard.run:22050/postgres?sslmode=require`.
- Updated `printOutput` to JSON-stringify nested values before calling `console.table`, then rebuilt and relinked the CLI.

## Review Guide

1. `apps/cli/src/utils/output.ts` – serialization change so table rows expose their nested payloads.
2. `apps/cli/README.md` – entirely new doc; skim for accuracy of install/test commands.
3. `apps/cli/src/services/sql-agent.ts` – file deletion; confirm no imports reference it.

## Testing

- [x] Manual testing performed (`qwery notebook run …` now prints JSON rows, CLI rebuilt and relinked, Angry Star flow executed end-to-end)
- [ ] Unit tests added/updated
- [ ] E2E tests added/updated

## Documentation

- [x] README updated (`apps/cli/README.md`)
- [ ] Code comments added (not needed)
- [ ] CHANGELOG.md updated (not applicable yet)

## User Impact

- CLI users can install `qwery` globally on any OS with a single set of commands.
- Datasource/notebook tables clearly show result rows, making manual NL-to-SQL debugging easier.
- NL-to-SQL code won’t be accidentally shipped until the feature is ready (cleaner surface area, no dead code).

## Checklist

- [x] Code follows project style guidelines
- [x] Self-review completed
- [x] Tests pass locally (`pnpm lint`, `pnpm typecheck`, manual CLI run)
- [x] Lint passes
- [x] Type check passes
- [x] This PR can be safely reverted if needed

