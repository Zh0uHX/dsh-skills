# Working conventions

Keep changes small enough to review. Test behavior at the service boundary and in the browser; use a real temporary filesystem for lifecycle and path-safety tests. Treat catalog fields and downloaded skill files as untrusted data. No shell execution of downloaded content.

Write concise Chinese product documentation. Explain decisions with their cost, not promotional adjectives. Never invent manual testing, user approval, measurements, or AI attribution.

Every feature goes through a branch and a PR linked to its GitHub issue. Include checks actually run, AI tool/model, and which decisions came from the user versus the implementation agent.

## Agent skills

### Issue tracker

Use GitHub Issues in `Zh0uHX/dsh-skills`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single context: `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.
