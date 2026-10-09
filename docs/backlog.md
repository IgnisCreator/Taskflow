# Backlog

Source of truth for scope: the consolidated P1 plan (kept in the planning repository). A task is **validated** only with evidence in `docs/validation.md`.

States: `pending` · `in progress` · `blocked` · `validated`.

| ID    | Milestone                                                   | State     | Evidence                                                                                 |
| ----- | ----------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------- |
| TF-01 | Environment, scaffold, Compose PostgreSQL, initial CI, docs | validated | `docs/validation.md`; CI green on GitHub since `6f21a2d`                                 |
| TF-02 | Authentication (GitHub) and profile                         | validated | `docs/validation.md`; real GitHub login confirmed by the owner (screenshots, 2026-10-09) |
| TF-03 | Domain schema, policies, projects                           | validated | `docs/validation.md` (TF-03 section)                                                     |
| TF-04 | Members, settings, permission matrix                        | validated | `docs/validation.md` (TF-04 section)                                                     |
| TF-05 | Task CRUD and board without drag                            | pending   |                                                                                          |
| TF-06 | Move/reorder, drag and drop, polling, conflicts             | pending   |                                                                                          |
| TF-07 | Filters, search, responsive, keyboard                       | pending   |                                                                                          |
| TF-08 | Docker production, full CI, publication, README, demo       | pending   |                                                                                          |
