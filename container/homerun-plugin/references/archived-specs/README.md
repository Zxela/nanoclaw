# Archived Specifications

These specs are **historical snapshots** from earlier homerun versions. They do not reflect the current architecture.

Key differences from current code:
- Uses a single "planning" phase instead of the current 3-layer split (scope-analysis + task-decomposition + validate-dag.sh)
- References "conductor" skill which was replaced by the inline team-lead skill in v5.0
- Hook design (H01-H19) was simplified — only 5 hooks were implemented (see `hooks/hooks.json`)

For current documentation, see:
- `references/state-schema.md` — current phase model and state transitions
- `references/hooks-configuration.md` — current hook registration
- `commands/create.md` — current workflow phases
