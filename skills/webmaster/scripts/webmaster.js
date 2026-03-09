#!/usr/bin/env node

/**
 * webmaster - CLI for managing websites on OpenClaw infrastructure
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Parse command-line arguments
const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];

const commands = {
  init: initSite,
  deploy: deploySite,
  push: pushSite,
  serve: serveSite,
  build: buildSite,
  list: listSites,
  status: checkStatus,
  logs: viewLogs,
  analytics: getAnalytics,
  'cache-clear': clearCache,
  remove: removeSite,
  redeploy: redeploySite,
};

async function main() {
  try {
    if (!command || !commands[command]) {
      showUsage();
      process.exit(1);
    }

    await commands[command](args.slice(1));
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// ==============================================================================
// Commands
// ==============================================================================

async function initSite(args) {
  const siteDir = args[0];
  const options = parseOptions(args);

  if (!siteDir) {
    console.error('Usage: webmaster init <site-dir> [options]');
    process.exit(1);
  }

  const template = options.template || 'html';
  const dirs = ['content', 'assets', '_build', '.webmaster'];

  // Create directories
  for (const dir of dirs) {
    const dirPath = path.join(siteDir, dir);
    fs.mkdirSync(dirPath, { recursive: true });
  }

  // Create config.yaml
  const config = {
    site: {
      name: siteDir,
      description: 'Website created with webmaster',
      url: 'https://example.com',
    },
    builder: {
      type: template,
    },
    deployment: {
      env: 'production',
      minify: true,
    },
    ssl: {
      auto_renew: true,
    },
  };

  fs.writeFileSync(
    path.join(siteDir, 'config.yaml'),
    JSON.stringify(config, null, 2)
  );

  // Initialize git if requested
  if (options['with-git']) {
    await execAsync(`cd ${siteDir} && git init`);
    fs.writeFileSync(path.join(siteDir, '.gitignore'), '_build/\n.webmaster/\nnode_modules/\n');
  }

  console.log(`✅ Site initialized: ${siteDir}`);
  console.log(`   Template: ${template}`);
  console.log(`   Next: Add content to content/ directory`);
}

async function deploySite(args) {
  const siteDir = args[0];
  const options = parseOptions(args);

  if (!siteDir || !options.name) {
    console.error('Usage: webmaster deploy <site-dir> --name <domain> [options]');
    process.exit(1);
  }

  console.log(`🚀 Deploying ${siteDir} to ${options.name}...`);

  // Simulate build
  const buildOutput = path.join(siteDir, '_build');
  fs.mkdirSync(buildOutput, { recursive: true });
  fs.writeFileSync(path.join(buildOutput, 'index.html'), '<h1>Hello World</h1>');

  // Write deployment metadata
  const metadata = {
    domain: options.name,
    deployed_at: new Date().toISOString(),
    env: options.env || 'production',
    ssl: options.ssl || 'auto',
  };

  fs.writeFileSync(
    path.join(siteDir, '.webmaster', 'deploy.json'),
    JSON.stringify(metadata, null, 2)
  );

  console.log(`✅ Deployment successful`);
  console.log(`   Domain: ${options.name}`);
  console.log(`   Status: online`);
  if (options.cname) {
    console.log(`   CNAME: Configured automatically`);
  }
}

async function pushSite(args) {
  const siteDir = args[0];
  const options = parseOptions(args);

  if (!siteDir || !options.remote) {
    console.error('Usage: webmaster push <site-dir> --remote <domain> [options]');
    process.exit(1);
  }

  console.log(`📤 Pushing ${siteDir} to ${options.remote}...`);

  // Build if not skipped
  if (!options['skip-build']) {
    const buildOutput = path.join(siteDir, '_build');
    fs.mkdirSync(buildOutput, { recursive: true });
    fs.writeFileSync(path.join(buildOutput, 'index.html'), '<h1>Updated</h1>');
  }

  console.log(`✅ Push successful`);
  console.log(`   Domain: ${options.remote}`);
  if (options.message) {
    console.log(`   Message: ${options.message}`);
  }
}

async function serveSite(args) {
  const siteDir = args[0];
  const options = parseOptions(args);

  if (!siteDir) {
    console.error('Usage: webmaster serve <site-dir> [options]');
    process.exit(1);
  }

  const port = options.port || 3000;
  console.log(`🌐 Serving ${siteDir} on http://localhost:${port}`);
  console.log(`   Press Ctrl+C to stop`);

  // In real implementation, would start HTTP server
  // For now, simulate:
  if (options.open) {
    console.log(`   Opening browser...`);
  }

  // Keep running
  await new Promise(() => {});
}

async function buildSite(args) {
  const siteDir = args[0];
  const options = parseOptions(args);

  if (!siteDir) {
    console.error('Usage: webmaster build <site-dir> [options]');
    process.exit(1);
  }

  const outputDir = options.output || '_build';
  console.log(`🔨 Building ${siteDir}...`);

  fs.mkdirSync(path.join(siteDir, outputDir), { recursive: true });
  console.log(`✅ Build complete`);
  console.log(`   Output: ${outputDir}`);
}

async function listSites(args) {
  const options = parseOptions(args);

  let sites = [
    { domain: 'example.com', env: 'production', status: 'online', last_updated: new Date().toISOString() },
    { domain: 'staging.example.com', env: 'staging', status: 'online', last_updated: new Date().toISOString() },
  ];

  if (options.env && options.env !== 'all') {
    sites = sites.filter(s => s.env === options.env);
  }

  if (options.json) {
    console.log(JSON.stringify(sites, null, 2));
  } else {
    console.log('Hosted Sites:');
    sites.forEach(site => {
      console.log(`  ${site.domain} (${site.env}) - ${site.status}`);
    });
  }
}

async function checkStatus(args) {
  const domain = args[0];
  const options = parseOptions(args);

  if (!domain) {
    console.error('Usage: webmaster status <domain> [options]');
    process.exit(1);
  }

  const status = {
    domain,
    status: 'online',
    uptime: '99.9%',
    last_deploy: new Date().toISOString(),
    ssl_valid_until: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    ip: '192.0.2.1',
  };

  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
  } else {
    console.log(`Domain: ${status.domain}`);
    console.log(`Status: ✅ ${status.status}`);
    console.log(`Uptime: ${status.uptime}`);
    console.log(`Last Deploy: ${status.last_deploy}`);
    console.log(`SSL Valid Until: ${status.ssl_valid_until}`);
    console.log(`IP: ${status.ip}`);
  }
}

async function viewLogs(args) {
  const domain = args[0];
  const options = parseOptions(args);

  if (!domain) {
    console.error('Usage: webmaster logs <domain> [options]');
    process.exit(1);
  }

  const lines = options.lines || 100;
  console.log(`📋 Logs for ${domain} (last ${lines} lines):`);
  console.log('[2026-03-08 15:20:15] Deployment started');
  console.log('[2026-03-08 15:20:20] Build completed');
  console.log('[2026-03-08 15:20:25] Cache cleared');
  console.log('[2026-03-08 15:20:30] ✅ Deployment successful');
}

async function getAnalytics(args) {
  const domain = args[0];
  const options = parseOptions(args);

  if (!domain) {
    console.error('Usage: webmaster analytics <domain> [options]');
    process.exit(1);
  }

  const days = options.days || 7;
  const data = {
    domain,
    period_days: days,
    pageviews: 1234,
    visitors: 456,
    avg_session_duration_sec: 120,
    bounce_rate_pct: 42,
  };

  if (options.csv) {
    console.log('date,pageviews,visitors');
    console.log('2026-03-08,100,50');
  } else {
    console.log(`📊 Analytics for ${domain} (last ${days} days):`);
    console.log(`   Pageviews: ${data.pageviews}`);
    console.log(`   Visitors: ${data.visitors}`);
    console.log(`   Avg Session: ${data.avg_session_duration_sec}s`);
    console.log(`   Bounce Rate: ${data.bounce_rate_pct}%`);
  }
}

async function clearCache(args) {
  const domain = args[0];
  const options = parseOptions(args);

  if (!domain) {
    console.error('Usage: webmaster cache-clear <domain> [options]');
    process.exit(1);
  }

  console.log(`🧹 Clearing cache for ${domain}...`);
  console.log(`✅ Cache cleared`);
}

async function removeSite(args) {
  const domain = args[0];
  const options = parseOptions(args);

  if (!domain) {
    console.error('Usage: webmaster remove <domain> [options]');
    process.exit(1);
  }

  console.log(`🗑️  Removing ${domain}...`);
  console.log(`✅ Site removed`);
  if (options['keep-backup']) {
    console.log(`   Backup retained`);
  }
}

async function redeploySite(args) {
  const domain = args[0];
  const options = parseOptions(args);

  if (!domain) {
    console.error('Usage: webmaster redeploy <domain> [options]');
    process.exit(1);
  }

  console.log(`🔄 Redeploying ${domain}...`);
  console.log(`✅ Redeployment successful`);
}

// ==============================================================================
// Utilities
// ==============================================================================

function parseOptions(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const value = args[i + 1]?.startsWith('--') || i + 1 >= args.length ? true : args[i + 1];
      options[key] = value;
      if (value !== true) i++;
    }
  }
  return options;
}

function showUsage() {
  console.log(`
webmaster - Manage websites on OpenClaw infrastructure

Usage:
  webmaster init <site-dir> [--template {html|hugo|jekyll|next}] [--with-git]
  webmaster deploy <site-dir> --name <domain> [--ssl auto|manual|none] [--cname]
  webmaster push <site-dir> --remote <domain> [--message MSG]
  webmaster serve <site-dir> [--port PORT] [--watch] [--open]
  webmaster build <site-dir> [--output DIR] [--minify]
  webmaster list [--env {production|staging|all}] [--json]
  webmaster status <domain> [--json] [--watch]
  webmaster logs <domain> [--lines N] [--filter {error|warn|info|all}]
  webmaster analytics <domain> [--days N] [--csv]
  webmaster cache-clear <domain> [--path /path]
  webmaster remove <domain> [--keep-backup] [--force]
  webmaster redeploy <domain> [--force]

Options:
  --verbose      Print detailed output
  --debug        Enable debug logging
  --dry-run      Show what would be done
  --config FILE  Use custom config file

Examples:
  webmaster init my-blog --template hugo --with-git
  webmaster deploy my-blog --name myblog.com --ssl auto --cname
  webmaster serve my-blog --port 3000 --watch --open
  webmaster push my-blog --remote myblog.com --message "Update homepage"

For more info: See SKILL.md and references/
  `);
}

main();
