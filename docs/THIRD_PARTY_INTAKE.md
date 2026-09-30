# Third-Party / Open-Source Intake

External projects are integrated as replaceable adapters or services unless a specific review approves deeper incorporation.

## Review checklist
- exact upstream repository and version
- license and commercial-use implications
- maintenance/activity
- security history and open vulnerabilities
- network/file/credential permissions
- data sent to the service
- tenant-isolation impact
- deployment footprint
- upgrade/rollback plan
- replacement/fallback plan
- UAT owner

## Integration rule
No external framework becomes the AIG authority layer. AIG CLOUD retains tenant identity, authorization, approvals, billing truth and evidence/audit control.

## Source separation
Do not copy BRAIN CORAL private code or MIG-private data into AIG CLOUD as a shortcut.
