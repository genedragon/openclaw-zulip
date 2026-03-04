#!/usr/bin/env python3
"""
zulip-audit.py — Quick Zulip realm audit tool.

Reads credentials from ZULIPRC env var, ~/.zuliprc, or a .zuliprc
file in the current directory.

Usage:
  python3 zulip-audit.py [--users] [--channels] [--subscriptions] [--all]

Examples:
  ZULIPRC=/path/to/.zuliprc python3 zulip-audit.py --all
  python3 zulip-audit.py --users --channels
"""

import argparse, json, os, sys, urllib.request, urllib.parse, base64


def get_creds():
    """Find and parse Zulip credentials from .zuliprc file."""
    candidates = [
        os.environ.get("ZULIPRC", ""),
        os.path.join(os.getcwd(), ".zuliprc"),
        os.path.expanduser("~/.zuliprc"),
    ]

    rc_path = None
    for path in candidates:
        if path and os.path.exists(path):
            rc_path = path
            break

    if not rc_path:
        return "", "", ""

    config = {}
    with open(rc_path) as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("[") and not line.startswith("#"):
                k, v = line.split("=", 1)
                config[k.strip()] = v.strip()

    return config.get("email", ""), config.get("key", ""), config.get("site", "")


def api_get(endpoint, email, key, site):
    """Make an authenticated GET request to the Zulip API."""
    url = f"{site}/api/v1/{endpoint}"
    req = urllib.request.Request(url)
    cred = base64.b64encode(f"{email}:{key}".encode()).decode()
    req.add_header("Authorization", f"Basic {cred}")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def audit_users(email, key, site):
    """Audit all users in the realm."""
    data = api_get("users", email, key, site)
    users = data.get("members", [])

    role_map = {100: "owner", 200: "admin", 300: "mod", 400: "member", 600: "guest"}

    print("\n=== USER AUDIT ===")
    print(f"{'ID':>4} | {'Name':20s} | {'Role':8s} | {'Bot':4s} | {'Active':6s} | {'Email'}")
    print("-" * 85)

    active_humans = 0
    active_bots = 0
    inactive = 0

    for u in sorted(users, key=lambda x: x["user_id"]):
        status = "✅" if u["is_active"] else "❌"
        role = role_map.get(u.get("role", 400), "?")
        bot = "🤖" if u["is_bot"] else ""
        email_display = u.get("delivery_email") or u.get("email", "?")

        print(
            f"{u['user_id']:4d} | {u['full_name']:20s} | {role:8s} | {bot:4s} | {status:6s} | {email_display}"
        )

        if u["is_active"]:
            if u["is_bot"]:
                active_bots += 1
            else:
                active_humans += 1
        else:
            inactive += 1

    print(f"\nTotal: {len(users)} users ({active_humans} humans, {active_bots} bots, {inactive} inactive)")


def audit_channels(email, key, site):
    """Audit all channels (streams) in the realm."""
    data = api_get("streams", email, key, site)
    streams = data.get("streams", [])

    print("\n=== CHANNEL AUDIT ===")
    print(f"{'ID':>4} | {'Name':30s} | {'Privacy':10s} | {'Default':7s} | {'Description'}")
    print("-" * 100)

    for s in sorted(streams, key=lambda x: x["name"]):
        privacy = "🔒 private" if s.get("invite_only") else "🌐 public"
        if s.get("is_web_public"):
            privacy = "🌍 web-pub"
        default = "✅" if s.get("is_default_stream") else ""
        desc = (s.get("description", "") or "—")[:40]
        archived = " [ARCHIVED]" if s.get("is_archived") else ""

        print(f"{s['stream_id']:4d} | {s['name']:30s} | {privacy:10s} | {default:7s} | {desc}{archived}")

    print(f"\nTotal: {len(streams)} channels")


def audit_subscriptions(email, key, site):
    """Audit channel subscriptions — who is in each channel."""
    streams_data = api_get("streams", email, key, site)
    users_data = api_get("users", email, key, site)

    user_map = {u["user_id"]: u["full_name"] for u in users_data.get("members", [])}

    print("\n=== SUBSCRIPTION AUDIT ===")

    for s in sorted(streams_data.get("streams", []), key=lambda x: x["name"]):
        try:
            members_data = api_get(f"streams/{s['stream_id']}/members", email, key, site)
            member_ids = members_data.get("subscribers", [])
            member_names = [user_map.get(mid, f"#{mid}") for mid in member_ids]

            privacy = "🔒" if s.get("invite_only") else "🌐"
            print(f"\n{privacy} #{s['name']} ({len(member_ids)} members)")
            for name in sorted(member_names):
                print(f"   - {name}")
        except Exception as e:
            print(f"\n❌ #{s['name']} — could not fetch subscribers: {e}")


def main():
    parser = argparse.ArgumentParser(description="Zulip realm audit tool")
    parser.add_argument("--users", action="store_true", help="Audit users")
    parser.add_argument("--channels", action="store_true", help="Audit channels")
    parser.add_argument("--subscriptions", action="store_true", help="Audit channel subscriptions")
    parser.add_argument("--all", action="store_true", help="Run all audits")
    args = parser.parse_args()

    if not any([args.users, args.channels, args.subscriptions, args.all]):
        args.all = True

    email, key, site = get_creds()
    if not all([email, key, site]):
        print(
            "Error: Could not read Zulip credentials.\n"
            "Set ZULIPRC env var, or place a .zuliprc file in ~ or the current directory.",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"🔐 Auditing realm: {site}")
    print(f"   As: {email}")

    if args.users or args.all:
        audit_users(email, key, site)
    if args.channels or args.all:
        audit_channels(email, key, site)
    if args.subscriptions or args.all:
        audit_subscriptions(email, key, site)

    print("\n✅ Audit complete.")


if __name__ == "__main__":
    main()
