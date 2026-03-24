#!/usr/bin/env node
/**
 * fix-policy.js - Repair S3 bucket policy for CloudFront OAC access
 * 
 * Use when a deployment has CloudFront AccessDenied errors
 * 
 * Usage:
 *   node scripts/fix-policy.js <bucket-name> <distribution-id>
 */

const { S3Client, PutBucketPolicyCommand, GetBucketPolicyCommand } = require('@aws-sdk/client-s3');
const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');

const REGION = process.env.AWS_REGION || 'us-east-2';

async function fixBucketPolicy(bucketName, distributionId) {
  console.log(`🔧 Fixing bucket policy for CloudFront OAC access`);
  console.log(`   Bucket: ${bucketName}`);
  console.log(`   Distribution: ${distributionId}`);
  console.log('');

  // Get account ID
  const stsClient = new STSClient({ region: REGION });
  const identity = await stsClient.send(new GetCallerIdentityCommand({}));
  const accountId = identity.Account;

  const s3Client = new S3Client({ region: REGION });

  // Check current policy
  console.log(`📋 Checking current bucket policy...`);
  let currentPolicy = null;
  try {
    const response = await s3Client.send(new GetBucketPolicyCommand({ Bucket: bucketName }));
    currentPolicy = JSON.parse(response.Policy);
    console.log(`✅ Current policy found (${currentPolicy.Statement.length} statement(s))`);
  } catch (error) {
    if (error.name === 'NoSuchBucketPolicy') {
      console.log(`⚠️  No policy found (will create new one)`);
      currentPolicy = { Version: '2012-10-17', Statement: [] };
    } else {
      throw error;
    }
  }

  // Update policy (ensure CloudFront statement exists)
  const oacStatement = {
    Sid: 'AllowCloudFrontOAC',
    Effect: 'Allow',
    Principal: {
      Service: 'cloudfront.amazonaws.com'
    },
    Action: 's3:GetObject',
    Resource: `arn:aws:s3:::${bucketName}/*`,
    Condition: {
      StringEquals: {
        'AWS:SourceArn': `arn:aws:cloudfront::${accountId}:distribution/${distributionId}`
      }
    }
  };

  // Remove old CloudFront statements
  currentPolicy.Statement = currentPolicy.Statement.filter(
    s => s.Sid !== 'AllowCloudFrontOAC' && !s.Principal?.Service?.includes('cloudfront')
  );

  // Add the new one
  currentPolicy.Statement.push(oacStatement);

  // Apply policy
  console.log('');
  console.log(`📤 Applying updated policy...`);
  console.log(`   Principal: cloudfront.amazonaws.com`);
  console.log(`   Action: s3:GetObject`);
  console.log(`   Resource: arn:aws:s3:::${bucketName}/*`);
  console.log(`   Condition: SourceArn = arn:aws:cloudfront::${accountId}:distribution/${distributionId}`);

  await s3Client.send(new PutBucketPolicyCommand({
    Bucket: bucketName,
    Policy: JSON.stringify(currentPolicy)
  }));

  console.log(`✅ Policy updated successfully!`);
  console.log('');
  console.log(`⏳ Note: Policy changes propagate in ~1-2 minutes`);
  console.log(`   Test access: curl -I https://<cloudfront-domain>/index.html`);

  return { bucketName, distributionId, accountId };
}

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: fix-policy.js <bucket-name> <distribution-id>');
    console.error('');
    console.error('Example:');
    console.error('  fix-policy.js webmaster-orgchart-1773585213200 E1HB0DGHE917BX');
    console.error('');
    console.error('Find your bucket and distribution with:');
    console.error('  node scripts/list.js');
    console.error('  node scripts/registry.js get <site-id>');
    process.exit(1);
  }

  const bucketName = args[0];
  const distributionId = args[1];

  fixBucketPolicy(bucketName, distributionId)
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      console.error('');
      console.error('❌ Fix failed:', error.message);
      console.error(error.stack);
      process.exit(1);
    });
}

module.exports = { fixBucketPolicy };
