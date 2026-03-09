---
name: webmaster
description: "Host websites on OpenClaw-managed infrastructure. Use when creating static sites (HTML/CSS/JS, Hugo, Jekyll, etc.), deploying and managing live sites, managing site content updates and redirects, checking site uptime and health, or working with site analytics and logs. Handles site provisioning, content deployment, DNS configuration, SSL certificates, and monitoring. For development testing use --local flag to test sites before production push."
---

# webMaster Skill

A comprehensive skill for creating, deploying, and managing websites on OpenClaw infrastructure.

## Quick Start

### Deploy a Static Site

```bash
# Start a new site
webmaster init my-site

# Deploy to production
webmaster deploy my-site --name example.com
```

### Manage Existing Sites

```bash
# List all hosted sites
webmaster list

# Check site status
webmaster status example.com

# Update site content
webmaster push my-site --remote example.com
```

### Local Testing

```bash
# Test site locally before deploy
webmaster serve my-site --local

# Build and serve
webmaster build my-site --serve --local
```

## Command Reference

For detailed command documentation, see [COMMANDS.md](references/COMMANDS.md).

## Site Lifecycle

1. **Initialize**: `webmaster init <site-dir>` creates the structure
2. **Develop**: Edit content locally, test with `--local` flag
3. **Deploy**: Push to production with `webmaster deploy` or `webmaster push`
4. **Monitor**: Check status, logs, analytics with `webmaster status/logs/analytics`
5. **Maintain**: Update content, manage DNS, renew SSL with standard commands

## Key Features

- **Static site generation**: Support for HTML, Hugo, Jekyll, Next.js, and custom builders
- **Content management**: Push updates, manage redirects, version control integration
- **SSL/HTTPS**: Automatic certificate provisioning and renewal
- **DNS management**: Configure custom domains and subdomains
- **Monitoring**: Uptime checks, health status, performance analytics
- **Local testing**: Build and serve sites locally before production deployment
- **CI/CD integration**: GitHub Actions, GitLab CI, or manual deployment workflows

## Before You Start

### Site Organization

```
my-site/
├── config.yaml          # Site metadata
├── content/             # Content files (HTML, markdown, etc.)
├── assets/              # Static files (CSS, JS, images)
├── _build/              # Generated output (git-ignored)
└── .webmaster/          # Internal metadata (git-ignored)
```

### Configuration

See [CONFIG.md](references/CONFIG.md) for full configuration options and examples.

## Workflows

### Create and Deploy a New Site

```bash
# 1. Initialize site structure
webmaster init my-blog

# 2. Add content (HTML/markdown files to content/)
# 3. Add styling (CSS/JS to assets/)

# 4. Test locally
webmaster serve my-blog --local

# 5. Deploy to production
webmaster deploy my-blog --name myblog.example.com
```

### Update Site Content

```bash
# 1. Make changes locally
# 2. Test with local server
webmaster serve my-blog --local

# 3. Push changes to remote
webmaster push my-blog --remote myblog.example.com

# 4. (Optional) Clear caches
webmaster cache-clear myblog.example.com
```

### Monitor Production Site

```bash
# Check current status
webmaster status myblog.example.com

# View logs (last 100 lines)
webmaster logs myblog.example.com --lines 100

# Get analytics
webmaster analytics myblog.example.com --days 7
```

## Site Builders

webmaster auto-detects site builders. Supported:

| Builder | Detection | Config |
|---------|-----------|--------|
| Static HTML | Files in `content/` | None |
| Hugo | `hugo.toml` or `config.yaml` | Auto-detected |
| Jekyll | `_config.yml` | Auto-detected |
| Next.js | `next.config.js` | Auto-detected |
| Custom | `config.yaml: builder: custom` | See CONFIG.md |

## Scripts

- `scripts/webmaster.js` - Main CLI tool
- `scripts/deploy.js` - Deployment workflow
- `scripts/monitor.js` - Health check and monitoring

See source files for implementation details.

## Tips & Troubleshooting

- **Local testing required** before production deploy - Use `--local` flag during development
- **Clear caches after updates** - `webmaster cache-clear <domain>` ensures fresh content
- **Monitor SSL expiry** - Certificates auto-renew, but you'll get email alerts 30 days prior
- **DNS propagation** - Allow 24-48 hours for DNS changes to fully propagate
- **Large deployments** - For sites >100MB, consider using git-based CI/CD instead of manual push

## Advanced Usage

- **Custom builders**: See [BUILDERS.md](references/BUILDERS.md) for building custom deployment logic
- **CI/CD integration**: See [CI-CD.md](references/CI-CD.md) for GitHub Actions, GitLab CI setup
- **Multi-region deployment**: See [DEPLOYMENT.md](references/DEPLOYMENT.md) for global CDN and multi-region options
- **API integration**: See [API.md](references/API.md) for programmatic site management

For all reference docs, see the `references/` folder.
