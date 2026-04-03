---
name: cso
description: Chief Security Officer mode. Run a structured security audit covering secrets, dependencies, CI/CD, LLM trust boundaries, OWASP Top 10, and STRIDE threat modeling. Use when asked to "security audit", "threat model", "pentest review", "OWASP", "CSO review", "check for vulnerabilities", or "security check".
categories: ["coding"]
---

# CSO — Chief Security Officer Mode

Adapted from Garry Tan's gstack CSO skill. Run a rigorous, structured security audit of the codebase.

## Modes

**Daily** (default): High-confidence gate — minimum 8/10 confidence to flag an issue. Zero noise. Only report real, exploitable findings. Takes ~5 minutes.

**Comprehensive**: Monthly deep scan — low bar of 2/10 confidence, flag anything suspicious. Takes 15–30 minutes.

If the user doesn't specify, use Daily mode.

## Setup

Identify the repo root. If not already cloned:

```bash
gh repo clone {owner}/{repo} /workspace/group/repos/{owner}/{repo} 2>/dev/null || true
REPO=/workspace/group/repos/{owner}/{repo}
```

Or use the current working repo if already checked out.

## Audit Areas (run in order)

### 1. Secrets Archaeology

Search code and git history for hardcoded credentials, API keys, tokens, and passwords.

```bash
cd $REPO

# Search for common secret patterns in tracked files
grep -rn --include="*.js" --include="*.ts" --include="*.py" --include="*.go" --include="*.env" --include="*.json" --include="*.yaml" --include="*.yml" \
  -E '(sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36}|AKIA[A-Z0-9]{16}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|password\s*=\s*["\x27][^"\x27]{4,}|api_key\s*=\s*["\x27][^"\x27]{4,}|secret\s*=\s*["\x27][^"\x27]{4,})' \
  . 2>/dev/null | head -50

# Check for accidentally committed .env files
git -C $REPO log --all --full-history -- "**/.env" "*.env" ".env" 2>/dev/null | head -20

# Search git history for secrets (last 50 commits)
git -C $REPO log --oneline -50 2>/dev/null | awk '{print $1}' | while read sha; do
  git -C $REPO show $sha --stat 2>/dev/null | grep -E '\.(env|key|pem|p12|pfx)$'
done

# Check .gitignore for missing entries
cat $REPO/.gitignore 2>/dev/null
```

Flag: hardcoded `sk-`, `ghp_`, `AKIA*`, private key headers, plaintext passwords, secrets in config files checked into git.

### 2. Dependency Supply Chain

```bash
cd $REPO

# Node/npm
if [ -f package.json ]; then
  npm audit --json 2>/dev/null | jq '.vulnerabilities | to_entries[] | select(.value.severity == "critical" or .value.severity == "high") | {package: .key, severity: .value.severity, via: .value.via}' 2>/dev/null | head -30
  # Check for unmaintained packages (no updates in >1yr) — inspect package-lock.json dates
  cat package.json | jq '.dependencies, .devDependencies' 2>/dev/null
fi

# Python
if [ -f requirements.txt ] || [ -f pyproject.toml ]; then
  pip-audit 2>/dev/null || safety check 2>/dev/null || echo "pip-audit/safety not available — review manually"
  cat requirements.txt 2>/dev/null
fi

# Rust
if [ -f Cargo.toml ]; then
  cargo audit 2>/dev/null || echo "cargo-audit not available — review Cargo.lock manually"
fi
```

Flag: critical/high CVEs, packages with recent ownership transfers, packages with <1000 weekly downloads in production paths, packages with no commits in >1 year.

### 3. CI/CD Pipeline Security

```bash
cd $REPO
find . -path "./.git" -prune -o -name "*.yml" -o -name "*.yaml" | xargs grep -l "github.event\|pull_request_target\|workflow_dispatch" 2>/dev/null | head -10

# For each workflow file found:
cat .github/workflows/*.yml 2>/dev/null
```

Check each workflow for:
- `pull_request_target` with code checkout from the PR branch (allows untrusted code to run with repo secrets)
- Unquoted `${{ github.event.pull_request.body }}`, `${{ github.event.issue.title }}`, or similar — script injection vectors
- Actions pinned by tag (e.g., `uses: actions/checkout@v3`) instead of SHA (e.g., `uses: actions/checkout@abc123`)
- Jobs with `permissions: write-all` or excessive scope
- Secrets passed as environment variables to untrusted steps

### 4. LLM / AI Trust Boundaries

If the codebase uses LLMs or AI APIs, check:

```bash
cd $REPO
grep -rn --include="*.js" --include="*.ts" --include="*.py" \
  -E '(openai|anthropic|langchain|llamaindex|system_prompt|messages\s*=|chat\.completions)' \
  . 2>/dev/null | head -20
```

Review each match for:
- User input passed directly into system prompts without sanitization
- Tool/function calls executed without validating the LLM's output first
- Missing rate limiting or cost controls on LLM-facing endpoints
- Prompt injection: can a user craft input that overrides instructions?
- Sensitive data (PII, secrets) included in prompts sent to third-party APIs

### 5. OWASP Top 10

Scan for the most impactful web vulnerabilities:

```bash
cd $REPO
# SQL injection — string concatenation with user input
grep -rn --include="*.js" --include="*.ts" --include="*.py" --include="*.go" \
  -E '(query|execute|raw)\s*\(.*\+|f".*SELECT|f".*INSERT|f".*UPDATE|\.format\(.*SELECT' \
  . 2>/dev/null | head -20

# XSS — unescaped HTML rendering
grep -rn --include="*.js" --include="*.ts" --include="*.jsx" --include="*.tsx" \
  -E 'dangerouslySetInnerHTML|\.innerHTML\s*=|document\.write\(' \
  . 2>/dev/null | head -20

# Insecure deserialization
grep -rn --include="*.js" --include="*.ts" --include="*.py" \
  -E '(eval\(|pickle\.loads|yaml\.load\(|JSON\.parse\(req)' \
  . 2>/dev/null | head -20

# Broken auth — missing auth middleware on routes
grep -rn --include="*.js" --include="*.ts" \
  -E '(router\.(get|post|put|delete|patch)\s*\(|app\.(get|post|put|delete|patch)\s*\()' \
  . 2>/dev/null | head -30
```

Review hits for:
- A01 Broken Access Control: endpoints missing auth checks, IDOR (using user-supplied IDs without ownership validation)
- A02 Cryptographic Failures: HTTP instead of HTTPS, MD5/SHA1 for passwords, ECB mode
- A03 Injection: SQL, command, LDAP injection via string concatenation
- A04 Insecure Design: missing rate limiting, no input validation
- A05 Security Misconfiguration: debug mode in production, default credentials, open CORS
- A06 Vulnerable Components: (covered in dependency scan above)
- A07 Auth Failures: weak session management, missing MFA for sensitive actions
- A08 Integrity Failures: unsigned packages, insecure deserialization
- A09 Logging Failures: secrets or PII in logs, no audit trail for sensitive actions
- A10 SSRF: user-controlled URLs fetched server-side without allowlist

### 6. STRIDE Threat Model

Map the STRIDE categories to the codebase's actual attack surface. Review the code's entry points (HTTP routes, message queues, file uploads, webhooks, CLI args) and apply each lens:

- **Spoofing**: Can an attacker impersonate a user or service? Check auth token validation, webhook signature verification (e.g., HMAC on GitHub webhooks), mTLS usage.
- **Tampering**: Can an attacker modify data in transit or at rest? Check for unsigned data, missing integrity checks, direct object manipulation.
- **Repudiation**: Are sensitive actions logged with enough context to audit? Check for audit logs on writes, deletes, privilege changes.
- **Information Disclosure**: What sensitive data could leak? Check error messages (stack traces to users), log verbosity, API responses that include more than needed.
- **Denial of Service**: Can an attacker exhaust resources? Check for missing rate limits, unbounded query results, resource-intensive operations without auth.
- **Elevation of Privilege**: Can a low-privilege user gain higher access? Check role checks on admin endpoints, mass assignment vulnerabilities, JWT algorithm confusion.

## Output Format

Structure findings by severity:

```
## CRITICAL (fix before ship)
[Issues where exploitation is straightforward and impact is severe]

## HIGH (fix this sprint)
[Issues that are exploitable but require more effort or have partial mitigations]

## MEDIUM (fix next sprint)
[Issues that could be exploited under specific conditions]

## LOW / INFORMATIONAL
[Defense-in-depth improvements, best practice gaps]

## Trend vs Last Audit
[Compare with /workspace/group/security-audit.md if it exists — note new issues, resolved issues, and overall trajectory]
```

For each finding include:
- Location (file:line)
- What the vulnerability is
- How it could be exploited (1–2 sentences)
- Recommended fix (concrete, not generic)

## Save the Audit

```bash
DATE=$(date +%Y-%m-%d)
# Write audit to /workspace/group/security-audit-{date}.md
```

Save the full report to `/workspace/group/security-audit-{date}.md`. Summarize the finding counts in chat (e.g., "2 CRITICAL, 3 HIGH, 5 MEDIUM — full report saved").
