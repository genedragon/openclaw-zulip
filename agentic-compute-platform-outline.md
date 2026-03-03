# Agentic Compute Platform: OpenClaw + Zulip

## 1. The Problem: Single-Threaded AI Chat
- Polluted context — one conversation mixes debugging, brainstorming, personal questions
- No specialization — same model, same prompt, same persona for everything
- No collaboration — agents can't talk to each other or work in parallel
- No persistence — conversation dies when the tab closes
- No organizational structure — can't separate projects, teams, or domains

## 2. Live Demo: What the Solution Looks Like
- Open Zulip — channels, topics, bots active in real time
- Show a real interaction: message an agent, get a response
- Point out: multiple bots, structured threads, persistent context

## 3. The Solution: Zulip as an Agentic Compute Platform
- Zulip's channel + topic model = natural routing layer for agents
- Each channel = a domain; each topic = a task or thread
- Agents subscribe to relevant channels, ignore the rest
- Humans and agents coexist in the same interface
- Full conversation history — agents wake up with context, not blank

## 4. Extensible Use Cases: Role-Based Agents
- **Editor** — proofreads, rewrites, enforces style
- **Builder** — writes code, runs tests, opens PRs
- **Quick responder** — lightweight model, fast answers, triages questions
- **System maintenance** — monitors services, runs health checks, restarts things
- **Local IT guy** — on-LAN support agent (deep dive next)
- Each agent gets: its own model, skills, persona, channel subscriptions
- Agents can participate in the *same* topic — true collaboration

## 5. Deep Dive: The "Local IT Guy"
- Small business deploys an OpenClaw node on the LAN
- Employees ask for help in the Zulip they already use
- **Handles ~60-70% of L1 tickets:**
  - Network diagnostics — ping, traceroute, nmap via CLI
  - Printer management — CUPS + browser tool on printer web UI
  - User support — password resets, account unlocks via SSH/LDAP
  - Wi-Fi admin — browser tool on AP dashboard
  - Proactive monitoring — cron-based disk/bandwidth/service alerts
- **Example:** "Conf room B printer is down" → agent pings, checks CUPS, reads error from web UI, responds with diagnosis
- **Limits:** physical layer, complex Windows GUI, "come to my desk"
- **Business case:** 24/7 instant L1 support, humans focus on real projects

## 6. Technical Backend

### Why Cloud Over a Mac Mini
- True network isolation (VPC, security groups)
- Enterprise-grade encryption (at rest, in transit, KMS)
- Scalable compute, professional ops, audit trails
- Mac Mini = home network as attack surface

### GitHub Projects That Make It Work
- **AWS EC2 + Bedrock sample** — reference deployment
- **Zulip plugin (ours)** — native OpenClaw ↔ Zulip integration
- **S3 file skill (ours)** — file sharing via pre-signed URLs

## 7. Wrap-Up & Q&A
