# Configuration Reference

Complete configuration options for webmaster sites.

## config.yaml Structure

```yaml
# Site metadata
site:
  name: "My Blog"
  description: "A personal blog"
  author: "Your Name"
  url: "https://myblog.com"
  language: "en"

# Builder configuration
builder:
  type: "hugo"  # html, hugo, jekyll, next, custom
  command: "hugo"  # Custom builder command
  output_dir: "public"
  # Type-specific options below

# Deployment configuration
deployment:
  env: "production"  # production, staging
  cdn: true
  minify: true
  sourcemaps: false
  cache:
    ttl: 3600  # seconds
    key_prefix: "my-blog"

# SSL/TLS
ssl:
  auto_renew: true
  provider: "letsencrypt"  # letsencrypt, custom
  notification_email: "admin@example.com"

# DNS
dns:
  auto_configure: true
  cname: "cdn.example.com"
  records: []

# Monitoring
monitoring:
  enabled: true
  check_interval: 300  # seconds
  alerting:
    email: "admin@example.com"
    slack_webhook: "https://hooks.slack.com/services/..."
    on_errors: true
    on_slowdown: true

# Analytics
analytics:
  enabled: true
  retention_days: 90
```

## Builder Configurations

### Hugo

```yaml
builder:
  type: hugo
  command: "hugo"
  output_dir: "public"
  minify: true
  # Hugo-specific options
  baseURL: "https://myblog.com"
  languageCode: "en-us"
```

### Jekyll

```yaml
builder:
  type: jekyll
  command: "jekyll build"
  output_dir: "_site"
  # Jekyll-specific options
  destination: "_site"
  source: "."
```

### Next.js

```yaml
builder:
  type: next
  command: "npm run build"
  output_dir: ".next"
  # Next.js-specific options
  basePath: ""
  trailingSlash: false
```

### Static HTML

```yaml
builder:
  type: html
  # No special config; deploys content/ as-is
```

### Custom Builder

```yaml
builder:
  type: custom
  command: "./scripts/build.sh"
  output_dir: "dist"
  env:
    NODE_ENV: "production"
    MY_VAR: "value"
```

## Deployment Environments

### Production

```yaml
deployment:
  env: production
  cdn: true
  minify: true
  cache:
    ttl: 86400  # 24 hours
```

### Staging

```yaml
deployment:
  env: staging
  cdn: false
  minify: false
  cache:
    ttl: 300  # 5 minutes
```

## SSL Options

### Auto-managed (LetsEncrypt)

```yaml
ssl:
  auto_renew: true
  provider: letsencrypt
  notification_email: "admin@example.com"
```

### Custom Certificate

```yaml
ssl:
  custom:
    cert_path: "/path/to/cert.pem"
    key_path: "/path/to/key.pem"
    auto_renew: false
```

## DNS Configuration

### Auto-configure with CNAME

```yaml
dns:
  auto_configure: true
  cname: "cdn.example.com"
```

### Manual Records

```yaml
dns:
  auto_configure: false
  records:
    - type: A
      value: "192.0.2.1"
    - type: AAAA
      value: "2001:db8::1"
    - type: MX
      value: "mail.example.com"
      priority: 10
```

## Monitoring

```yaml
monitoring:
  enabled: true
  check_interval: 300  # 5 minutes
  alerting:
    email: "admin@example.com"
    slack_webhook: "https://hooks.slack.com/services/..."
    on_errors: true
    on_slowdown: true  # Alert if response >2s
    on_offline: true
```

## Analytics Configuration

```yaml
analytics:
  enabled: true
  retention_days: 90
  track_referrer: true
  track_os: true
  track_browser: true
  track_device: true
```

## Redirects

```yaml
redirects:
  - from: "/old-post"
    to: "/blog/new-post"
    permanent: true  # 301 vs 302
  - from: "/old-page"
    to: "https://external.com"
    permanent: false
```

## Headers

```yaml
headers:
  - path: "/*"
    headers:
      Cache-Control: "public, max-age=3600"
      X-Custom-Header: "value"
  - path: "/api/*"
    headers:
      Cache-Control: "no-cache"
```

## Security

```yaml
security:
  https_only: true
  hsts_max_age: 31536000
  x_frame_options: "DENY"
  x_content_type_options: "nosniff"
  content_security_policy: "default-src 'self'"
```

## Examples

### Simple Blog

```yaml
site:
  name: "My Blog"
  url: "https://myblog.com"

builder:
  type: hugo

deployment:
  env: production
  minify: true

ssl:
  auto_renew: true

monitoring:
  enabled: true
```

### Next.js Application

```yaml
site:
  name: "Dashboard"
  url: "https://dashboard.example.com"

builder:
  type: next
  command: "npm run build"

deployment:
  env: production
  cdn: true
  minify: true

ssl:
  auto_renew: true
  notification_email: "ops@example.com"

monitoring:
  enabled: true
  check_interval: 60
```
