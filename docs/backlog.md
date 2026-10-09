# Backlog

Source of truth for scope: the consolidated P1 plan (kept in the planning repository). A task is **validated** only with evidence in `docs/validation.md`.

States: `pending` · `in progress` · `blocked` · `validated`.

| ID    | Milestone                                                   | State             | Evidence                                                                                               |
| ----- | ----------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------ |
| TF-01 | Environment, scaffold, Compose PostgreSQL, initial CI, docs | validated (local) | `docs/validation.md`, commit `32beb0c`. Open item: CI workflow not executed, pending remote repository |
| TF-02 | Authentication (GitHub) and profile                         | in progress       | Automated checks in `docs/validation.md`; open item: manual real GitHub login by the owner             |
| TF-03 | Domain schema, policies, projects                           | pending           |                                                                                                        |
| TF-04 | Members, settings, permission matrix                        | pending           |                                                                                                        |
| TF-05 | Task CRUD and board without drag                            | pending           |                                                                                                        |
| TF-06 | Move/reorder, drag and drop, polling, conflicts             | pending           |                                                                                                        |
| TF-07 | Filters, search, responsive, keyboard                       | pending           |                                                                                                        |
| TF-08 | Docker production, full CI, publication, README, demo       | pending           |                                                                                                        |
