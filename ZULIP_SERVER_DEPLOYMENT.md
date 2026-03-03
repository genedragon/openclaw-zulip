# Deploying Zulip Server on AWS EC2

A step-by-step guide to deploying a self-hosted [Zulip](https://zulip.com/) server on AWS EC2 for use with the `@openclaw/zulip` plugin.

## Why Self-Host Zulip?

- **Data sovereignty** — Your agent's conversations stay on your infrastructure
- **No per-seat pricing** — One EC2 instance, unlimited users/bots
- **HIPAA-capable** — Self-hosted = you control the compliance story
- **Low cost** — $16-33/month on a shared EC2 instance

## Prerequisites

- An AWS account with EC2 access
- A domain name (optional but recommended for SSL)
- Basic Linux/SSH knowledge
- ~30 minutes

## Architecture

```
┌─────────────────────────────────────────────┐
│  EC2 Instance (t4g.medium or t4g.large)     │
│                                             │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │  OpenClaw    │  │  Zulip Server        │  │
│  │  Gateway     │  │  ├── nginx (443)     │  │
│  │  (18789)     │◄─┤  ├── Django/uwsgi    │  │
│  │              │  │  ├── PostgreSQL       │  │
│  │  @openclaw/  │  │  ├── Redis           │  │
│  │  zulip       │  │  ├── RabbitMQ        │  │
│  │  plugin      │  │  └── Memcached       │  │
│  └─────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────┘
```

Both OpenClaw and Zulip can run on the same EC2 instance. Zulip needs ~2GB RAM minimum; a `t4g.large` (8GB) gives comfortable headroom.

## Step 1: Launch EC2 Instance

**Recommended specs:**

| Setting | Value |
|---------|-------|
| Instance type | `t4g.medium` (2 vCPU, 4GB) minimum; `t4g.large` (2 vCPU, 8GB) recommended |
| AMI | Ubuntu 24.04 LTS (ARM64/Graviton) |
| Storage | 30GB gp3 minimum |
| Security group | Ports 22 (SSH), 80 (HTTP), 443 (HTTPS) |

> **Cost note:** `t4g.medium` is ~$24/month on-demand, ~$15/month reserved. ARM (Graviton) instances are ~20% cheaper than x86 equivalents.

```bash
# After launching, SSH in
ssh -i your-key.pem ubuntu@<your-ec2-public-ip>
```

## Step 2: Install Zulip Server

```bash
# Download Zulip server
cd /tmp
curl -fLO https://download.zulip.com/server/zulip-server-latest.tar.gz
tar xzf zulip-server-latest.tar.gz

# Run the installer
cd zulip-server-*/
sudo scripts/setup/install \
  --hostname=<YOUR_HOSTNAME> \
  --email=admin@<YOUR_HOSTNAME> \
  --self-signed-cert \
  --no-push-notifications \
  --postgresql-version=16
```

**Important flags:**
- `--hostname` — Your domain name or EC2 public hostname
- `--self-signed-cert` — Start with self-signed; upgrade to Let's Encrypt later
- `--postgresql-version=16` — **Use 16, not 18.** PostgreSQL 18 has `io_uring` issues on ARM/Graviton instances
- `--no-push-notifications` — Skip Zulip's push notification service (not needed for bot-only use)

The installer handles everything: PostgreSQL, Redis, RabbitMQ, Memcached, nginx, Django, and database migrations.

## Step 3: Configure Domain & SSL

### Option A: With a Domain (Recommended)

```bash
# Point your domain DNS to the EC2 public IP (A record)
# Then get a Let's Encrypt certificate:
sudo /home/zulip/deployments/current/scripts/setup/setup-certbot \
  --hostname=zulip.yourdomain.com \
  --email=you@yourdomain.com
```

### Option B: Without a Domain (EC2 hostname)

The self-signed certificate from the installer works immediately. You can access Zulip at:
```
https://<ec2-public-hostname>.compute.amazonaws.com
```

> **Note:** Mobile apps and some browsers will warn about self-signed certs. A real domain + Let's Encrypt is strongly recommended for production.

## Step 4: Create Your Organization

After installation, the installer outputs a one-time link:

```
https://<YOUR_HOSTNAME>/new/
```

1. Open this URL in your browser
2. Create the organization (name, admin email, password)
3. Log in as the admin

### Realm Domain Mapping

If login fails after setup, map your hostname to the organization realm. This is required for single-org deployments:

```bash
sudo -u zulip /home/zulip/deployments/current/manage.py shell << 'EOF'
from zerver.models import Realm, RealmDomain

realm = Realm.objects.get(string_id="")  # Root organization
hostname = "<YOUR_HOSTNAME>"

if not RealmDomain.objects.filter(realm=realm, domain=hostname).exists():
    RealmDomain.objects.create(realm=realm, domain=hostname)
    print(f"Created domain mapping: {hostname} -> {realm.name}")
else:
    print("Domain mapping already exists")
EOF
```

Zulip supports multi-organization setups by default. Single-org deployments need an explicit domain → realm mapping for authentication to work.

## Step 5: Create a Bot

1. Log into Zulip as admin
2. Go to **Settings** → **Personal settings** → **Bots**
3. Click **Add a new bot**
   - Bot type: **Generic bot**
   - Name: Your bot's display name (e.g., "MyAgent")
4. Copy the **bot email** and **API key**

These credentials go into your OpenClaw config (see the [main README](README.md#configuration)).

## Step 6: Configure Email (Optional)

For password resets and notifications, configure outgoing email via AWS SES:

```bash
sudo nano /etc/zulip/settings.py
```

Add:
```python
EMAIL_BACKEND = "django_ses.SESBackend"
AWS_SES_REGION_NAME = "us-west-2"  # Your SES region
NOREPLY_EMAIL_ADDRESS = "noreply@yourdomain.com"  # Must be SES-verified
ADD_TOKENS_TO_NOREPLY_ADDRESS = False
AWS_SES_AUTO_THROTTLE = None  # Avoids needing ses:GetSendQuota permission
```

```bash
sudo /home/zulip/deployments/current/scripts/restart-server
```

> **SES Sandbox:** New SES accounts are in sandbox mode — only verified email addresses can receive mail. Request production access in the AWS Console for unrestricted sending.

> **Important:** `django_ses` uses the boto3 API, not SMTP. Do not configure SMTP settings (`EMAIL_HOST`, `EMAIL_PORT`) when using the SES backend.

## Step 7: Connect OpenClaw

With the bot credentials from Step 5:

```bash
# Interactive setup
openclaw setup
# Select "Zulip" and enter bot email, API key, and server URL
```

Or configure manually — see the [main README](README.md#configuration) for config format.

Verify the connection:
```bash
openclaw gateway restart
openclaw status
# Should show: Zulip ON · OK
```

## Production Hardening Checklist

| Task | Priority | Notes |
|------|----------|-------|
| SSL: Let's Encrypt | **High** | Replace self-signed cert; enables mobile app access |
| Change default passwords | **High** | Admin + any temp passwords used during setup |
| Enable 2FA | Medium | Zulip supports TOTP-based 2FA |
| SES: Exit sandbox | Medium | Required for sending to unverified addresses |
| Automated backups | Medium | S3 + cron; Zulip has built-in backup tools |
| Elastic IP | Medium | Prevents IP change on instance stop/start |
| Rate limiting | Low | Re-enable after initial setup (`RATE_LIMITING_ENABLED = True`) |
| Monitoring | Low | CloudWatch or Zulip's `/api/v1/server_settings` health endpoint |

## Troubleshooting

### Login fails with no useful error
Zulip's auth flow: `hostname → RealmDomain → Realm → delivery_email lookup → password check`. If login fails, check:
1. RealmDomain mapping exists (see Step 4)
2. `delivery_email` field is populated (not just `email`) — Zulip uses `delivery_email` exclusively for authentication
3. Password was set via Django's `set_password()`, not raw SQL

### SES emails not sending
- `django_ses` uses boto3, not SMTP — don't mix settings
- Zulip's `computed_settings.py` can override `DEFAULT_FROM_EMAIL` — use `NOREPLY_EMAIL_ADDRESS` instead
- Verify the sender address in SES console

### PostgreSQL 18 crashes on ARM
Use `--postgresql-version=16`. PostgreSQL 18 has `io_uring` memory allocation issues on Graviton instances.

## Cost Breakdown

| Component | Monthly Cost |
|-----------|-------------|
| EC2 t4g.large (shared with OpenClaw) | $15-30 |
| SES (low volume) | $0-1 |
| S3 backups | $1-2 |
| Elastic IP | $0 (while attached) |
| **Total** | **$16-33** |

## Useful Commands

```bash
# Restart Zulip server
sudo /home/zulip/deployments/current/scripts/restart-server

# Check service status
sudo supervisorctl status

# Django management shell
sudo -u zulip /home/zulip/deployments/current/manage.py shell

# View Zulip logs
sudo tail -f /var/log/zulip/server.log

# Backup
sudo /home/zulip/deployments/current/manage.py backup

# Update Zulip
sudo /home/zulip/deployments/current/scripts/upgrade-zulip zulip-server-latest.tar.gz
```

## Further Reading

- [Zulip Server Installation Guide](https://zulip.readthedocs.io/en/latest/production/install.html)
- [Zulip API Documentation](https://zulip.com/api/)
- [AWS SES Developer Guide](https://docs.aws.amazon.com/ses/latest/dg/)
- [OpenClaw Documentation](https://docs.openclaw.ai)
- [`@openclaw/zulip` Plugin README](README.md)
