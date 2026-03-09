# webmaster Commands Reference

Complete command documentation for the webmaster skill.

## Global Options

All commands support these options:

```
--verbose      Print detailed output
--debug        Enable debug logging
--dry-run      Show what would be done without making changes
--config FILE  Use custom config file
```

## Commands

### `webmaster init <site-dir>`

Initialize a new site structure.

**Options:**
- `--template {html|hugo|jekyll|next}` - Template type (default: html)
- `--with-git` - Initialize git repository
- `--with-ci` - Set up CI/CD workflows (GitHub Actions)

**Example:**
```bash
webmaster init my-blog --template hugo --with-git
```

**Creates:**
```
my-blog/
├── config.yaml
├── content/
├── assets/
└── .gitignore
```

---

### `webmaster deploy <site-dir> --name <domain>`

Deploy a site to production.

**Options:**
- `--name DOMAIN` (required) - Domain name (e.g., example.com)
- `--subdomain SUB` - Deploy to subdomain (e.g., blog.example.com)
- `--ssl {auto|manual|none}` - SSL certificate handling (default: auto)
- `--cname` - Auto-configure CNAME records
- `--env {production|staging}` - Deployment environment (default: production)

**Example:**
```bash
webmaster deploy my-blog --name myblog.com --ssl auto --cname
```

---

### `webmaster push <site-dir> --remote <domain>`

Update an already-deployed site with local changes.

**Options:**
- `--remote DOMAIN` (required) - Remote domain
- `--skip-build` - Skip rebuilding; push as-is
- `--no-cache` - Don't cache generated files
- `--message MSG` - Deployment message (for logging)

**Example:**
```bash
webmaster push my-blog --remote myblog.com --message "Update homepage"
```

---

### `webmaster serve <site-dir>`

Build and serve site locally for testing.

**Options:**
- `--port PORT` - Port number (default: 3000)
- `--open` - Automatically open in browser
- `--watch` - Watch for file changes and rebuild
- `--build-only` - Build but don't serve

**Example:**
```bash
webmaster serve my-blog --port 3000 --watch --open
```

---

### `webmaster build <site-dir>`

Build site without serving.

**Options:**
- `--output DIR` - Output directory (default: _build/)
- `--minify` - Minify CSS/JS
- `--sourcemaps` - Generate source maps
- `--clean` - Clean output before building

**Example:**
```bash
webmaster build my-blog --output dist/ --minify
```

---

### `webmaster list`

List all hosted sites.

**Options:**
- `--env {production|staging|all}` - Filter by environment (default: production)
- `--json` - Output JSON format

**Example:**
```bash
webmaster list --json
```

**Output:**
```json
[
  {
    "domain": "myblog.com",
    "env": "production",
    "status": "online",
    "last_updated": "2026-03-08T15:20:00Z"
  }
]
```

---

### `webmaster status <domain>`

Check site status and metadata.

**Options:**
- `--watch` - Continuously monitor (updates every 10s)
- `--json` - Output JSON format

**Example:**
```bash
webmaster status myblog.com --watch
```

**Output:**
```
Domain: myblog.com
Status: ✅ Online
Uptime: 99.9%
Last Deploy: 2026-03-08 15:20 UTC
SSL: Valid until 2027-03-08
IP: 192.0.2.1
```

---

### `webmaster logs <domain>`

View deployment and error logs.

**Options:**
- `--lines N` - Number of lines to show (default: 100)
- `--filter {error|warn|info|all}` - Filter log level (default: all)
- `--follow` - Follow logs in real-time
- `--since DURATION` - Show logs from last N hours (e.g., 24h, 7d)

**Example:**
```bash
webmaster logs myblog.com --lines 50 --filter error
```

---

### `webmaster analytics <domain>`

Get site analytics.

**Options:**
- `--days N` - Number of days to report (default: 7)
- `--metric {pageviews|visitors|bounce|avg-time}` - Specific metric
- `--csv` - Output CSV format

**Example:**
```bash
webmaster analytics myblog.com --days 30 --metric pageviews --csv
```

---

### `webmaster ssl <domain>`

Manage SSL certificates.

**Subcommands:**
- `ssl status` - Show cert expiry and details
- `ssl renew` - Manually renew certificate
- `ssl add-custom CERT KEY` - Install custom certificate

**Example:**
```bash
webmaster ssl myblog.com status
webmaster ssl myblog.com renew
```

---

### `webmaster dns <domain>`

Manage DNS records.

**Subcommands:**
- `dns status` - Show current records
- `dns set-cname TARGET` - Configure CNAME
- `dns add-record TYPE VALUE` - Add custom record
- `dns list` - List all records

**Example:**
```bash
webmaster dns myblog.com status
webmaster dns myblog.com set-cname myblog.example.com.
```

---

### `webmaster cache-clear <domain>`

Clear all caches for a domain.

**Options:**
- `--deep` - Clear entire cache (slow)
- `--path /path` - Clear specific path only

**Example:**
```bash
webmaster cache-clear myblog.com --path /blog
```

---

### `webmaster redeploy <domain>`

Redeploy site from last successful build.

**Options:**
- `--force` - Skip safety checks
- `--from-backup` - Restore from backup before redeploy

**Example:**
```bash
webmaster redeploy myblog.com
```

---

### `webmaster remove <domain>`

Remove a hosted site.

**Options:**
- `--keep-backup` - Keep backup (don't delete)
- `--force` - Skip confirmation

**Example:**
```bash
webmaster remove myblog.com --keep-backup
```

---

## Exit Codes

- `0` - Success
- `1` - General error
- `2` - Invalid arguments
- `3` - Site not found
- `4` - Deployment failed
- `5` - Network/connectivity error

## Environment Variables

- `WEBMASTER_HOME` - Override default config location
- `WEBMASTER_CACHE_DIR` - Override cache directory
- `WEBMASTER_LOGLEVEL` - Set log level (debug|info|warn|error)
