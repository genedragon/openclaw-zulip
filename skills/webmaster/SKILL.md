---
name: webmaster
version: 3.0.0
description: "Deploy static websites with dedicated buckets, auto asset path fixing, and deployment registry. One bucket per site, clean URLs, tracked in DynamoDB."
---

# WebMaster v3

Deploy and manage static websites on AWS with automatic asset fixing, dedicated buckets, and centralized registry.

## What's New in v3

✅ **Dedicated Buckets** - One bucket per site (clean architecture, no prefix confusion)  
✅ **Auto Asset Path Fixing** - Rewrites relative paths (`href="style.css"`) to absolute (`href="/style.css"`)  
✅ **Deployment Registry** - DynamoDB tracking of all sites (owner, status, costs)  
✅ **Clean URLs** - Sites deploy to CloudFront root (`https://d111.cloudfront.net/`)  
✅ **No Manual Config** - Creates bucket + CloudFront + OAC automatically  

## Quick Start

### Deploy a New Site

```bash
cd ~/.openclaw/workspace/skills/webmaster-v3
node scripts/deploy.js /path/to/site my-site-name your-agent --description "My awesome site"
```

**What it does:**
1. Creates S3 bucket: `webmaster-my-site-name-{timestamp}`
2. Creates CloudFront distribution with OAC
3. Rewrites asset paths in HTML files
4. Uploads all files to S3
5. Registers deployment in DynamoDB
6. Returns live URL

### List All Deployments

```bash
node scripts/list.js

# Filter by owner
node scripts/list.js --owner=your-agent

# Filter by status
node scripts/list.js --status=active
```

### Find Deployment by URL

```bash
node scripts/registry.js find-url https://d12oifhayl0q88.cloudfront.net/
```

## Commands

### `deploy.js` - Deploy New Site

```bash
node scripts/deploy.js <site-dir> <site-name> <owner> [options]

Options:
  --description "..."       Site description
  --custom-domain example.com  Custom domain (optional)

Example:
  node scripts/deploy.js ./acp-site acp-platform your-agent \
    --description "ACP marketing site"
```

### `list.js` - List Deployments

```bash
node scripts/list.js [options]

Options:
  --owner=NAME      Filter by owner
  --status=STATUS   Filter by status (active|archived|deleted)

Example:
  node scripts/list.js --owner=your-agent --status=active
```

### `registry.js` - Query Registry

```bash
node scripts/registry.js <command> [args]

Commands:
  list [--owner=NAME] [--status=STATUS]   List deployments
  get <siteId>                             Get deployment details
  find-url <url>                           Find by URL

Examples:
  node scripts/registry.js list --owner=your-agent
  node scripts/registry.js get acp-platform-1773145000
  node scripts/registry.js find-url https://d12oif.cloudfront.net/
```

### `rewrite-paths.js` - Fix Asset Paths

```bash
node scripts/rewrite-paths.js <directory> [options]

Options:
  --prefix PATH     Deployment prefix (for subdirectories)
  --dry-run         Preview changes without modifying files
  --verbose         Show detailed output

Examples:
  # Root deployment (most common)
  node scripts/rewrite-paths.js ./site

  # Subdirectory deployment
  node scripts/rewrite-paths.js ./site --prefix blog

  # Preview changes
  node scripts/rewrite-paths.js ./site --dry-run --verbose
```

## DynamoDB Registry Schema

```json
{
  "siteId": "acp-platform-1773145000",
  "siteName": "acp-platform",
  "description": "ACP marketing site",
  "owner": "your-agent",
  "status": "active",
  "createdAt": "2026-03-10T12:00:00Z",
  "updatedAt": "2026-03-10T12:30:00Z",
  "primaryUrl": "https://d12oif.cloudfront.net/",
  "customDomain": null,
  "dnsConfigured": false,
  "bucket": {
    "name": "webmaster-acp-platform-1773145000",
    "region": "us-east-2"
  },
  "cloudfront": {
    "distributionId": "E1EM8YW6PQTHBD",
    "domainName": "d12oif.cloudfront.net"
  },
  "lastDeployment": {
    "deployedAt": "2026-03-10T12:30:00Z",
    "deployedBy": "your-agent"
  }
}
```

## Architecture

```
User Request
    ↓
CloudFront Distribution (HTTPS)
    ↓ (authenticated via OAC)
S3 Bucket (Private)
    └── index.html
    └── style.css
    └── script.js
```

**Key Points:**
- S3 bucket is private (public access blocked)
- CloudFront uses Origin Access Control (OAC) with sigv4 signing
- Bucket policy allows CloudFront via SourceArn condition
- Clean URLs: `https://d111.cloudfront.net/` (no `/prefix/` suffix)

## Deployment Flow

1. **Create S3 Bucket**
   - Name: `webmaster-{siteName}-{timestamp}`
   - Region: `us-east-2` (configurable)
   - Public access: **Blocked**

2. **Create Origin Access Control (OAC)**
   - Signing: `sigv4` (secure)
   - Behavior: `always`

3. **Create CloudFront Distribution**
   - Origin: S3 bucket
   - OAC: Attached
   - DefaultRootObject: `index.html`
   - HTTPS: Required (redirect HTTP)

4. **Apply Bucket Policy**
   - Allow CloudFront OAC (service principal + SourceArn)

5. **Rewrite Asset Paths**
   - Fix `href="style.css"` → `href="/style.css"`
   - Handles CSS, JS, images, background URLs

6. **Upload Files**
   - Recursive directory upload
   - Correct Content-Type headers

7. **Register in DynamoDB**
   - Store all deployment metadata
   - Enables `list`, `get`, `find-url` queries

## Lessons Learned (from v2)

### Issue #1: Broken CSS/JS (Relative Paths)
**Problem:** `href="style.css"` broke when deployed to subdirectory  
**Solution:** Auto-rewrite to absolute paths before upload  
**Status:** ✅ Fixed in v3

### Issue #2: CloudFront 403 Errors
**Problem:** DefaultRootObject pointed to wrong path  
**Solution:** Deploy to root, DefaultRootObject = `index.html`  
**Status:** ✅ Fixed in v3 (dedicated buckets eliminate path confusion)

### Issue #3: Ugly URLs
**Problem:** URLs had `/prefix/` suffix  
**Solution:** Deploy to CloudFront root (no prefix)  
**Status:** ✅ Fixed in v3 (dedicated bucket = clean URLs)

## Permissions Required

See `V3_PERMISSIONS_REQUIRED.md` for IAM policy details.

**Summary:**
- DynamoDB: Full access to `webmaster-deployments` table
- S3: Create/manage buckets matching `webmaster-*`
- CloudFront: Create distributions, OAC, invalidations

## Migration from v2

To backfill existing deployments into the registry:

```javascript
const { registerDeployment } = require('./scripts/registry');

// Register existing site
await registerDeployment({
  siteName: 'example-site',
  bucketName: 'example-bucket-1234567890',
  bucketRegion: 'us-east-2',
  distributionId: 'E2N07NPW2774Y4',
  domainName: 'd24tw21ym5fbx1.cloudfront.net',
  owner: 'your-agent',
  description: 'example.com main site'
});
```

## Troubleshooting

### CloudFront Returns 403 Error
- **Cause:** Distribution still deploying (takes 2-3 minutes)
- **Fix:** Wait, then check: `aws cloudfront get-distribution --id DIST_ID`

### CSS/JS Not Loading
- **Cause:** Asset paths not rewritten
- **Fix:** Run `rewrite-paths.js` manually, then re-upload

### Site Not in Registry
- **Cause:** Deployed with v2, not registered
- **Fix:** Use `registerDeployment()` to backfill

## Next Steps

- [ ] Add `update` command (push new content to existing site)
- [ ] Add `delete` command (tear down bucket + distribution)
- [ ] Add `archive` command (mark as inactive)
- [ ] Add cost tracking (CloudWatch metrics)
- [ ] Add custom domain setup automation (DNS + SSL)

## Support

Questions? Issues? Found a bug?
- **Zulip:** #webMaster skill test
- **GitHub:** (coming soon after v3 stabilizes)

---

**Version:** 3.0.0  
**Last Updated:** 2026-03-10  
**Status:** Production-ready ✅
