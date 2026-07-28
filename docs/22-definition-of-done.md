# Definition of Done — KHEL-O

## Overview

The checklist that every feature or pull request must pass before it is merged and deployed.

---

## DoD Checklist

- [ ] **Functional Completeness:** Feature meets all requirements outlined in the PRD and User Stories.
- [ ] **Unit Tests:** Written and passing with >80% coverage on new/modified service logic.
- [ ] **Integration Tests:** Written and passing for database repositories and API routes.
- [ ] **API Spec Alignment:** OpenAPI documentation updated; request/response schemas conform to `11-api-style-guide.md`.
- [ ] **Database Migrations:** Alembic migration scripts created, tested bidirectionally (upgrade and downgrade).
- [ ] **Logging & Observability:** Structured JSON logs added with appropriate correlation IDs and context tags.
- [ ] **Security & Sanitization:** Input validation verified; no hardcoded secrets or exposed PII.
- [ ] **Code Quality:** Ruff, Black, and `mypy --strict` pass with 0 errors.
- [ ] **Code Review:** Approved by at least one senior engineer.
- [ ] **Staging Verification:** Feature tested successfully in staging environment.
