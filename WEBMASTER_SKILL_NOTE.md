# WebMaster Skill Added

New skill added to `skills/webmaster/` directory.

## Files Included
- `SKILL.md` — Main skill documentation
- `DEPLOYMENT.md` — CloudFront deployment integration guide
- `scripts/` — CLI tools (webmaster.js, deploy.js, monitor.js)
- `references/` — COMMANDS.md, CONFIG.md
- `assets/` — Sample HTML template

## Dependencies
- Requires: PVM (Permissions Vending Machine) for temporary AWS access
- See: https://github.com/genedragon/permissions-vending-machine

## Quick Start
1. Initialize site: `webmaster init mysite`
2. Add content to `mysite/content/`
3. Build locally: `webmaster build mysite`
4. For CloudFront deployment: See `DEPLOYMENT.md`

## Future Features (GitHub Issues)
- [ ] Unified deployment wrapper (`webmaster deploy --to cloudfront`)
- [ ] Auto-config validation with helpful error messages
- [ ] `--local-only` flag for git-based workflow

---
**Status:** Beta (tested with CloudFront deployment)
**Last Updated:** 2026-03-09
