# Key Rotation Cadence Policy (Baseline)

## Objective
Reduce credential exposure risk by enforcing recurring key review and rotation.

## Cadence
- Standard keys: rotate every 90 days
- Privileged or externally exposed keys: rotate every 30-60 days
- Immediate rotation triggers:
  - Suspected compromise
  - Owner change/termination
  - Production incident involving key leakage

## Minimum controls
- [ ] Every key has owner + business purpose
- [ ] Expiry dates are set when possible
- [ ] Rotation event logged in change management log
- [ ] Revoked keys are validated as non-functional

## Evidence to collect
- Key inventory snapshot (ID/prefix only; never full secret)
- Rotation ticket/change record
- Validation output after rotation
