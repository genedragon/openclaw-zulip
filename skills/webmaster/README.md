# webmaster Skill

Static site deployment and management for OpenClaw agents.

## Overview

The webmaster skill provides a CLI for managing static HTML/CSS/JS websites with automated deployment to S3 and CloudFront. Perfect for agent-generated documentation, dashboards, and reports.

**Location:** `skills/webmaster/`

## Features

- 🏗️ **Site scaffolding** — `webmaster init` creates project structure
- 📦 **Build pipeline** — Validates, minifies, and prepares content
- 🚀 **S3 deployment** — Direct upload to S3 buckets
- ☁️ **CloudFront integration** — CDN distribution with cache management
- 📊 **Monitoring** — Health checks, analytics, logs
- 🔐 **PVM integration** — Request temporary S3/CloudFront permissions

## Quick Start

```bash
# Install dependencies
cd skills/webmaster
npm install

# Initialize a new site
node scripts/webmaster.js init my-site --template html

# Build the site
cd my-site
node ../scripts/webmaster.js build

# Deploy (requires PVM approval for S3 access)
node ../scripts/webmaster.js deploy --name my-site --bucket my-bucket
```

## Documentation

- **[SKILL.md](./SKILL.md)** — Complete skill documentation
- **[COMMANDS.md](./references/COMMANDS.md)** — CLI command reference
- **[CONFIG.md](./references/CONFIG.md)** — Configuration guide

## Dependencies

- **PVM (Permissions Vending Machine)** — For temporary S3/CloudFront access
- **AWS SDK** — S3 and CloudFront API calls
- **Node.js 18+** — Runtime

## Integration with OpenClaw

This skill is designed for OpenClaw agents that need to:
- Generate documentation sites
- Create monitoring dashboards
- Publish reports and analytics
- Deploy static web applications

Agents request permissions via PVM, deploy via webmaster CLI, and monitor via built-in commands.

## Related

- [PVM Documentation](https://github.com/genedragon/permissions-vending-machine)
- [OpenClaw Zulip Plugin](../)

---

For detailed deployment guides including CloudFront setup and troubleshooting, see the skill documentation.
