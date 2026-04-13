# WebMaster Skill Deployment Integration Guide

## Overview

The **webmaster skill** manages local site builds and structure. For cloud deployment, it integrates with:
- **AWS S3** (storage)
- **AWS CloudFront** (distribution)
- **PVM** (permission requests for temporary AWS access)

This guide covers the complete workflow.

## What WebMaster Does (and Doesn't)

### ✅ WebMaster Handles
- Site initialization (`init`)
- Building HTML/Hugo/Jekyll/etc (`build`)
- Local testing (`serve`)
- Config management (`config.yaml`)
- Local health checks

### ❌ WebMaster Does NOT Handle
- S3 uploads
- CloudFront distribution creation
- DNS management
- SSL certificate provisioning

For cloud operations, use external tools (shown below).

## Complete Deployment Workflow

### Step 1: Initialize & Build Locally

```bash
# Initialize site structure
webmaster init mysite --template html --with-git

# Add content
cp -r my-pages/* mysite/content/
cp -r my-styles/* mysite/assets/

# Test locally
webmaster build mysite
webmaster serve mysite --local

# Verify all is correct before deploying
```

### Step 2: Request S3 Upload Permissions via PVM

```bash
# Request temporary S3 write access
pvm-request.sh \
  --name "mysite-deploy" \
  --action "s3:PutObject" \
  --resource "arn:aws:s3:::my-bucket/mysite/*" \
  --minutes 15

# Wait for email approval, then proceed to step 3
# (Note: Permission valid for 15 minutes from grant time)
```

### Step 3: Upload Build Output to S3

```bash
# Upload all files in _build/ to S3
aws s3 sync mysite/_build/ s3://my-bucket/mysite/ \
  --delete \
  --region us-east-2

# Verify upload
aws s3 ls s3://my-bucket/mysite/ --recursive --region us-east-2
```

### Step 4: Create CloudFront Distribution

```bash
# Create distribution config
cat > cf-config.json << 'EOF'
{
  "CallerReference": "mysite-$(date +%s)",
  "Comment": "My Site Distribution",
  "Enabled": true,
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "S3-Origin",
      "DomainName": "my-bucket.s3.REGION.amazonaws.com",
      "S3OriginConfig": {"OriginAccessIdentity": ""},
      "OriginAccessControlId": "{OAC_ID_FROM_STEP_5}"
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3-Origin",
    "ViewerProtocolPolicy": "allow-all",
    "TrustedSigners": {"Enabled": false, "Quantity": 0},
    "TrustedKeyGroups": {"Enabled": false, "Quantity": 0},
    "ForwardedValues": {
      "QueryString": false,
      "Cookies": {"Forward": "none"}
    },
    "MinTTL": 0,
    "DefaultTTL": 86400,
    "MaxTTL": 31536000
  }
}
EOF

# Create distribution
aws cloudfront create-distribution --distribution-config file://cf-config.json
```

### Step 5: Set Up Origin Access Control (OAC)

```bash
# Create OAC for S3 bucket
aws cloudfront create-origin-access-control \
  --origin-access-control-config '{
    "Name": "mysite-oac",
    "Description": "OAC for mysite S3 bucket",
    "OriginAccessControlOriginType": "s3",
    "SigningBehavior": "always",
    "SigningProtocol": "sigv4"
  }'

# Note the ID returned — use in cf-config.json above
```

### Step 6: Update S3 Bucket Policy

```bash
# Allow CloudFront distribution to read from S3
aws s3api put-bucket-policy --bucket my-bucket --region us-east-2 \
  --policy '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "cloudfront.amazonaws.com"},
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::my-bucket/mysite/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::ACCOUNT_ID:distribution/{DISTRIBUTION_ID}"
        }
      }
    }]
  }'
```

### Step 7: Fix S3 Public Access Settings

```bash
# CloudFront OAC requires these specific settings:
aws s3api put-public-access-block --bucket my-bucket --region us-east-2 \
  --public-access-block-configuration '{
    "BlockPublicAcls": true,
    "IgnorePublicAcls": true,
    "BlockPublicPolicy": false,
    "RestrictPublicBuckets": false
  }'

# This allows bucket policies (CloudFront OAC) while keeping objects private
```

### Step 8: Invalidate CloudFront Cache

```bash
# Force CloudFront to refetch objects from S3
aws cloudfront create-invalidation \
  --distribution-id {DISTRIBUTION_ID} \
  --paths "/mysite/*"

# Wait for invalidation to complete (check status)
aws cloudfront get-invalidation \
  --distribution-id {DISTRIBUTION_ID} \
  --id {INVALIDATION_ID} \
  --query 'Invalidation.Status'
```

### Step 9: Test Live Site

```bash
# Visit CloudFront domain
https://{DISTRIBUTION_DOMAIN}.cloudfront.net/mysite/index.html
```

## Troubleshooting

### CloudFront Returns "AccessDenied"

**Cause 1: S3 Public Access Blocks**
```bash
# Check settings
aws s3api get-public-access-block --bucket my-bucket --region us-east-2

# Fix: BlockPublicPolicy and RestrictPublicBuckets must be FALSE
aws s3api put-public-access-block --bucket my-bucket --region us-east-2 \
  --public-access-block-configuration '{
    "BlockPublicAcls": true,
    "IgnorePublicAcls": true,
    "BlockPublicPolicy": false,
    "RestrictPublicBuckets": false
  }'
```

**Cause 2: Cached AccessDenied Response**
```bash
# Invalidate cache after fixing policy
aws cloudfront create-invalidation --distribution-id {ID} --paths "/mysite/*"
```

### S3 Bucket Policy Attachment Fails

```bash
# Verify bucket policy was attached
aws s3api get-bucket-policy --bucket my-bucket --region us-east-2 --query Policy --output text | python3 -m json.tool

# If empty, check IAM role has s3:PutBucketPolicy permission
# Use PVM to request it if running in EC2 with limited role
```

### PVM Request Times Out

```bash
# Approval window: 5 minutes from email
# Permission valid: 60 minutes from approval (default)

# If you let the window expire, submit a NEW request:
pvm-request.sh \
  --name "mysite-deploy-retry" \
  --action "s3:PutObject" \
  --resource "arn:aws:s3:::my-bucket/mysite/*" \
  --minutes 15
```

## Environment Variables for PVM

When using PVM with webmaster deployment:

```bash
# Required
PVM_API_BASE="https://YOUR_PVM_API_ENDPOINT"
PVM_REQUESTER_IDENTITY="arn:aws:iam::ACCOUNT_ID:role/YOUR_ROLE"

# Optional
PVM_REQUEST_TIMEOUT_SECONDS=3600
PVM_POLL_INTERVAL_SECONDS=10
```

## Best Practices

1. **Always test locally first**
   ```bash
   webmaster serve mysite --local
   # Verify all pages load and links work
   ```

2. **Use git for config tracking**
   ```bash
   webmaster init mysite --with-git
   git add mysite/config.yaml
   git commit -m "site config"
   ```

3. **Set reasonable PVM timeouts**
   - Request: 15-30 minutes (enough for approval + execution)
   - Credentials valid: Use sooner to be safe

4. **Cache invalidation is essential**
   - Always invalidate after policy changes
   - Use `--paths "/mysite/*"` to be specific

5. **Monitor CloudFront distribution status**
   ```bash
   aws cloudfront get-distribution \
     --id {DISTRIBUTION_ID} \
     --query 'Distribution.Status'
   # Wait for "Deployed" status before testing
   ```

## Integration with CI/CD

Example GitHub Actions workflow:

```yaml
name: Deploy WebMaster Site to CloudFront

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build with webmaster
        run: |
          webmaster init mysite
          cp -r content/* mysite/content/
          webmaster build mysite
      
      - name: Request PVM permissions
        run: |
          pvm-request.sh \
            --action s3:PutObject \
            --resource "arn:aws:s3:::my-bucket/mysite/*" \
            --minutes 15
          # Wait for approval in email
      
      - name: Upload to S3
        run: |
          aws s3 sync mysite/_build/ s3://my-bucket/mysite/
      
      - name: Invalidate CloudFront
        run: |
          aws cloudfront create-invalidation \
            --distribution-id $DISTRIBUTION_ID \
            --paths "/mysite/*"
```

## References

- **WebMaster Skill:** See SKILL.md in webmaster directory
- **PVM Skill:** See pvm-use skill documentation
- **AWS CloudFront:** https://docs.aws.amazon.com/cloudfront/
- **AWS S3:** https://docs.aws.amazon.com/s3/

---

**Version:** 1.0  
**Last Updated:** 2026-03-09  
**Status:** Production Ready
