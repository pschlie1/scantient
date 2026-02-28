# Evidence Export Commands

## Incident timeline export
```bash
npm run export:incident-evidence -- \
  --org=<ORG_ID> \
  --from=2026-02-01T00:00:00Z \
  --to=2026-02-28T00:00:00Z \
  --out=./tmp/incident-evidence.json
```

## Change/audit report export
```bash
npm run export:change-report -- \
  --org=<ORG_ID> \
  --from=2026-02-01T00:00:00Z \
  --to=2026-02-28T00:00:00Z \
  --out=./tmp/change-report.json
```

## GTM baseline export
```bash
npm run export:gtm-baseline -- \
  --org=<ORG_ID> \
  --from=2026-02-01T00:00:00Z \
  --to=2026-02-28T00:00:00Z \
  --out=./tmp/gtm-baseline.json
```

All exports are intended for internal compliance evidence and should be stored in controlled access locations.
