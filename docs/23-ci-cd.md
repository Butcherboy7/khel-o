# CI/CD Pipeline Design — KHEL-O

## Overview

Pipeline specification using GitHub Actions for continuous integration, automated testing, and environment promotions.

---

## 1. Branching Strategy

- `main` -> Production branch (auto-deploys to Production environment after manual approval gate).
- `staging` -> Staging branch (auto-deploys to Staging on merge).
- `feature/*` -> Development branches (PR created against `staging`).

---

## 2. GitHub Actions Workflow (.github/workflows/ci.yml)

```yaml
name: KHEL-O CI/CD Pipeline

on:
  push:
    branches: [ main, staging ]
  pull_request:
    branches: [ main, staging ]

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          pip install ruff black mypy
      - name: Run Ruff
        run: ruff check .
      - name: Run Black
        run: black --check .
      - name: Run Mypy
        run: mypy app

  test:
    needs: lint-and-typecheck
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: khel_o_test
          POSTGRES_PASSWORD: testpassword
        ports:
          - 5432:5432
      redis:
        image: redis:7
        ports:
          - 6379:6379
    steps:
      - uses: actions/checkout@v4
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Install Project Dependencies
        run: pip install -r requirements.txt
      - name: Run Pytest
        run: pytest --cov=app tests/
```
