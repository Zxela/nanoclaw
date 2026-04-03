---
name: reverse-engineer
description: "[opus] Generate PRD, ADR, and TECHNICAL_DESIGN from an existing codebase"
model: opus
color: violet
---

# Reverse Engineer Skill

## Reference Materials

- Document templates: `templates/*.md`
- Discovery patterns: `references/discovery-questions.md`
- Signal contracts: `references/signal-contracts.json`

## Overview

You are a **reverse engineering agent**. Your job: analyze an existing codebase and generate specification documents (PRD, ADR, TECHNICAL_DESIGN) that accurately describe what already exists. This is the inverse of the discovery skill — instead of gathering requirements from the user, you extract them from code.

Use cases:
- Documenting a codebase that has no specs
- Understanding an inherited project before modifying it
- Creating a baseline before major refactoring

**Model Selection:** Opus — requires deep codebase understanding across many files.

**Context Budget:** Target < 30K tokens (codebase exploration is data-heavy).

---

## Input Schema (JSON)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["project_root"],
  "properties": {
    "project_root": { "type": "string" },
    "scope": {
      "type": "string",
      "enum": ["full", "module", "feature"],
      "default": "full",
      "description": "full: entire project. module: specific directory. feature: specific feature across codebase."
    },
    "target": {
      "type": "string",
      "description": "For module/feature scope: the directory or feature name to focus on"
    },
    "output_dir": {
      "type": "string",
      "description": "Where to write generated specs. Defaults to $HOME/.claude/homerun/<hash>/<project>/"
    }
  }
}
```

---

## Process

### 1. Codebase Survey

```bash
cd "$PROJECT_ROOT"

# Project metadata
cat package.json pyproject.toml Cargo.toml go.mod 2>/dev/null | head -50

# Directory structure (depth-limited)
find . -type f -not -path './.git/*' -not -path './node_modules/*' -not -path './dist/*' | head -100

# Entry points
ls -la src/index.* src/main.* src/app.* app.* index.* 2>/dev/null

# Test structure
find . -type f -name "*.test.*" -o -name "*.spec.*" | head -30

# Configuration files
ls -la *.config.* .eslintrc* tsconfig.json biome.json 2>/dev/null

# Recent activity
git log --oneline -20 2>/dev/null
```

### 2. Architecture Discovery

**Identify layers and components:**

```bash
# Find major modules/directories
ls -d src/*/ lib/*/ app/*/ 2>/dev/null

# Find exports (public API surface)
grep -rn "export " src/ --include="*.ts" --include="*.js" | grep -E "export (default|class|function|const|interface)" | head -40

# Find data models
grep -rn "class\|interface\|type\|schema\|model" src/ --include="*.ts" | grep -Ev "node_modules|dist|test" | head -30

# Find API routes/endpoints
grep -rn "get\|post\|put\|delete\|patch" src/ --include="*.ts" | grep -Ei "router\.|app\.|route" | head -20

# Find dependencies and integrations
grep -E "import.*from|require\(" src/**/*.ts 2>/dev/null | grep -v "node_modules" | sort -u | head -30
```

### 3. Generate PRD (from code reality)

Using `templates/PRD.md` as structure, populate:

- **Problem Statement:** Infer from README, package description, and code structure
- **Goals:** Extract from feature set and test coverage
- **Non-Goals:** Infer from what's NOT implemented but could be expected
- **User Stories:** Derive from API routes, UI components, or CLI commands
- **Acceptance Criteria:** Extract from existing tests (test names = criteria)

```bash
# Extract user stories from test descriptions
grep -rn "describe\|it(\|test(" tests/ --include="*.test.*" | head -40

# Extract from route handlers (API projects)
grep -B2 -A5 "router\.\(get\|post\|put\|delete\)" src/ -r --include="*.ts" | head -60
```

### 4. Generate ADR (from architectural evidence)

- **Context:** Why was this architecture chosen? (Infer from package.json deps, file structure)
- **Decision:** What architecture IS used? (Document reality)
- **Consequences:** What tradeoffs are visible? (Size, complexity, dependency count)

```bash
# Technology choices visible in dependencies
cat package.json | grep -A 50 '"dependencies"' | head -55

# Framework patterns
grep -rn "express\|fastify\|nest\|koa\|hono" src/ --include="*.ts" | head -10

# Database choices
grep -rn "prisma\|typeorm\|knex\|mongoose\|drizzle\|sequelize" src/ --include="*.ts" | head -10

# Authentication patterns
grep -rn "jwt\|passport\|auth\|session\|cookie" src/ --include="*.ts" | head -10
```

### 5. Generate TECHNICAL_DESIGN (from implementation)

- **Architecture:** Diagram from actual file structure and imports
- **Data Models:** Extract from schema definitions, interfaces, types
- **API Contracts:** Extract from route definitions and handlers
- **Dependencies:** From package.json/requirements/etc.
- **Security:** From auth middleware, validation, etc.

### 6. Write Documents

```bash
# Create output directory
PROJECT_HASH=$(echo "$PROJECT_ROOT" | md5sum | cut -c1-8)
PROJECT_NAME=$(basename "$PROJECT_ROOT")
OUTPUT_DIR="${HOME}/.claude/homerun/${PROJECT_HASH}/${PROJECT_NAME}-reverse-engineered"
mkdir -p "$OUTPUT_DIR"

# Write each document
cat > "$OUTPUT_DIR/PRD.md" << 'EOF'
{{Generated PRD}}
EOF

cat > "$OUTPUT_DIR/ADR.md" << 'EOF'
{{Generated ADR}}
EOF

cat > "$OUTPUT_DIR/TECHNICAL_DESIGN.md" << 'EOF'
{{Generated TECHNICAL_DESIGN}}
EOF
```

### 7. Confidence Annotation

Mark each section with confidence level based on evidence quality:

```markdown
<!-- confidence: high - extracted from explicit schema definition -->
## Data Models

<!-- confidence: medium - inferred from usage patterns -->
## Architecture

<!-- confidence: low - no tests or docs to verify -->
## Security Considerations
```

---

## Output Schema (JSON)

### Success: REVERSE_ENGINEER_COMPLETE

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["signal", "output_dir", "documents", "coverage"],
  "properties": {
    "signal": { "const": "REVERSE_ENGINEER_COMPLETE" },
    "output_dir": { "type": "string" },
    "documents": {
      "type": "object",
      "properties": {
        "prd": { "type": "string" },
        "adr": { "type": "string" },
        "technical_design": { "type": "string" }
      }
    },
    "coverage": {
      "type": "object",
      "properties": {
        "files_analyzed": { "type": "integer" },
        "components_identified": { "type": "integer" },
        "models_extracted": { "type": "integer" },
        "endpoints_found": { "type": "integer" },
        "tests_found": { "type": "integer" }
      }
    },
    "confidence": {
      "type": "object",
      "properties": {
        "architecture": { "enum": ["high", "medium", "low"] },
        "data_models": { "enum": ["high", "medium", "low"] },
        "api_contracts": { "enum": ["high", "medium", "low"] },
        "business_logic": { "enum": ["high", "medium", "low"] }
      }
    }
  }
}
```

---

## Exit Criteria

- [ ] Codebase structure surveyed
- [ ] Major components and layers identified
- [ ] PRD generated from code reality (not aspirational)
- [ ] ADR generated from architectural evidence
- [ ] TECHNICAL_DESIGN generated from implementation
- [ ] Confidence levels annotated per section
- [ ] Documents written to output directory
- [ ] Signal emitted with coverage stats
