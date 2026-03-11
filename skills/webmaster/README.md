# WebMaster — Static Website Hosting Skill for OpenClaw

Deploy and manage static websites on AWS with CloudFront CDN, automated quality checks, and deployment tracking.

## Features

- **Dedicated S3 buckets** — One per site, private, no public access
- **CloudFront CDN** — HTTPS, caching, Origin Access Control (OAC)
- **DynamoDB registry** — Track all deployments (owner, status, URLs)
- **Auto asset path rewriting** — Fixes relative paths for clean deployment
- **Quality checks** — Asset validation + broken link detection (default ON)
- **Push/update command** — Update existing sites with cache invalidation
- **Accessibility checks** — pa11y WCAG 2.1 (optional, requires Chromium)

## Quick Start

### Install

```bash
npm install
```

### Deploy a Site

```bash
node scripts/deploy.js ./my-site my-site-name your-name --description "My awesome site"
```

This will:
1. Validate all assets exist (images, CSS, JS)
2. Check for broken internal links
3. Create private S3 bucket (`webmaster-{name}-{timestamp}`)
4. Create CloudFront distribution with OAC
5. Rewrite relative asset paths to absolute
6. Upload all files with correct Content-Type headers
7. Register deployment in DynamoDB

### Update an Existing Site

```bash
# By URL
node scripts/push.js ./updated-site --url https://d12345.cloudfront.net/

# By site ID
node scripts/push.js ./updated-site --site-id my-site-1773145000
```

### List Deployments

```bash
node scripts/list.js
node scripts/list.js --owner=your-name
node scripts/list.js --status=active
```

## Commands

| Command | Description |
|---------|-------------|
| `deploy.js` | Deploy new site (creates bucket + CloudFront + registry) |
| `push.js` | Update existing site (uploads + cache invalidation) |
| `list.js` | List all registered deployments |
| `registry.js` | Query deployment registry (get, find-url) |
| `validate-assets.js` | Check for missing assets (CSS, JS, images) |
| `check-links.js` | Find broken internal links |
| `check-accessibility.js` | WCAG 2.1 accessibility audit (requires Chromium) |
| `rewrite-paths.js` | Fix relative asset paths to absolute |

### Deploy Options

```bash
node scripts/deploy.js <site-dir> <site-name> <owner> [options]

Options:
  --description "..."       Site description
  --custom-domain name      Custom domain (optional)
  --no-checks               Skip quality checks (not recommended)
```

### Push Options

```bash
node scripts/push.js <site-dir> [options]

Options:
  --url <cloudfront-url>    Find site by URL
  --site-id <id>            Find site by registry ID
  --no-checks               Skip quality checks
```

## Architecture

```
User Request
    ↓
CloudFront (HTTPS, caching, edge locations)
    ↓ (OAC authentication, sigv4)
S3 Bucket (private, public access blocked)
    └── index.html
    └── style.css
    └── assets/
```

- S3 buckets are **private** (public access blocked)
- CloudFront uses **Origin Access Control (OAC)** with sigv4 signing
- Bucket policy allows **only CloudFront** via SourceArn condition
- Clean URLs: sites deploy to CloudFront root (no prefix paths)

## Quality Checks

Automated checks run by default before every deployment:

| Check | Blocks Deploy? | Details |
|-------|---------------|---------|
| Asset validation | ✅ Yes | Missing images, CSS, JS |
| Link checking | ✅ Yes | Broken internal `<a href>` links |
| Accessibility | ⚠️ Warns | WCAG Level A errors (Level AA = warning) |

Skip with `--no-checks` (not recommended for production).

### Platform Notes
- **x86_64**: All checks work (including pa11y accessibility)
- **ARM64**: Asset + link checks work; accessibility gracefully skipped (Chromium unavailable)

## Configuration

### AWS Region

Default region is `us-east-2`. Override with environment variable:

```bash
export AWS_REGION=us-west-2
```

### DynamoDB Table

Uses `webmaster-deployments` table. Created automatically if it doesn't exist.

## AWS Permissions Required

| Service | Permissions | Scope |
|---------|------------|-------|
| S3 | Create/manage buckets | `webmaster-*` pattern |
| CloudFront | Create distributions, OAC, invalidations | All |
| DynamoDB | Full access | `webmaster-deployments` table |

## OpenClaw Skill Usage

This is an [OpenClaw](https://github.com/openclaw/openclaw) skill. Place it in your workspace's `skills/` directory:

```
~/.openclaw/workspace/skills/webmaster-v3/
```

The agent will use `SKILL.md` for instructions on how to deploy and manage sites.

## Project Structure

```
webmaster-v3/
├── scripts/
│   ├── deploy.js               # Main deployment
│   ├── push.js                 # Update existing sites
│   ├── list.js                 # List deployments
│   ├── registry.js             # DynamoDB registry client
│   ├── rewrite-paths.js        # Asset path fixer
│   ├── validate-assets.js      # Asset validator
│   ├── check-links.js          # Link checker
│   └── check-accessibility.js  # Accessibility auditor
├── SKILL.md                    # OpenClaw skill guide
├── package.json
└── README.md
```

## License

Apache 2.0

---

**Version:** 5.0.0
**Status:** Production Ready
