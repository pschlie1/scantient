# Compliance & Evidence Bundle Baseline

This folder contains Wave 3 baseline artifacts to support SOC 2/ISO-style evidence collection.

## Structure
- `policies/access-review-template.md`
- `policies/key-rotation-cadence.md`
- `checklists/incident-evidence-checklist.md`
- `logs/change-management-log-template.md`
- `evidence-exports.md`

## Suggested cadence
- Access review: monthly
- Key rotation review: monthly; rotate keys every 90 days (or faster for high-risk keys)
- Incident evidence packaging: per incident + monthly archive
- Change management log review: weekly

## API endpoints (org-scoped)
- `GET /api/internal/incidents/export?from=<ISO>&to=<ISO>`
- `GET /api/internal/changes/report?from=<ISO>&to=<ISO>`
- `GET /api/internal/gtm/baseline?from=<ISO>&to=<ISO>`

## CLI evidence exports
- `npm run export:incident-evidence -- --org=<ORG_ID> --from=<ISO> --to=<ISO> --out=./tmp/incident.json`
- `npm run export:change-report -- --org=<ORG_ID> --from=<ISO> --to=<ISO> --out=./tmp/change.json`
- `npm run export:gtm-baseline -- --org=<ORG_ID> --from=<ISO> --to=<ISO> --out=./tmp/gtm.json`
