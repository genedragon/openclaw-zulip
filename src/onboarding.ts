import type { ChannelOnboardingAdapter, OpenClawConfig, WizardPrompter } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import {
  listZulipAccountIds,
  resolveDefaultZulipAccountId,
  resolveZulipAccount,
} from "./zulip/accounts.js";
import { promptAccountId } from "./onboarding-helpers.js";

const channel = "zulip" as const;

async function noteZulipSetup(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "1) Zulip Settings -> Personal settings -> Bots",
      "2) Create a bot + copy its email and API key",
      "3) Use your server base URL (e.g., https://zulip.example.com)",
      "Tip: the bot will receive messages where it's mentioned or in DMs.",
      "Docs: https://docs.openclaw.ai/channels/zulip",
    ].join("\n"),
    "Zulip bot credentials",
  );
}

async function promptZulipCredentials(prompter: WizardPrompter): Promise<{
  botEmail: string;
  botToken: string;
  baseUrl: string;
}> {
  const botEmail = String(
    await prompter.text({
      message: "Enter Zulip bot email",
      validate: (value) => (value?.trim() ? undefined : "Required"),
    }),
  ).trim();
  const botToken = String(
    await prompter.text({
      message: "Enter Zulip bot API key",
      validate: (value) => (value?.trim() ? undefined : "Required"),
    }),
  ).trim();
  const baseUrl = String(
    await prompter.text({
      message: "Enter Zulip base URL",
      validate: (value) => (value?.trim() ? undefined : "Required"),
    }),
  ).trim();
  return { botEmail, botToken, baseUrl };
}

export const zulipOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const configured = listZulipAccountIds(cfg).some((accountId) => {
      const account = resolveZulipAccount({ cfg, accountId });
      return Boolean(account.botEmail && account.botToken && account.baseUrl);
    });
    return {
      channel,
      configured,
      statusLines: [`Zulip: ${configured ? "configured" : "needs email + token + url"}`],
      selectionHint: configured ? "configured" : "needs setup",
      quickstartScore: configured ? 2 : 1,
    };
  },
  configure: async ({ cfg, prompter, accountOverrides, shouldPromptAccountIds }) => {
    const override = accountOverrides.zulip?.trim();
    const defaultAccountId = resolveDefaultZulipAccountId(cfg);
    let accountId = override ? normalizeAccountId(override) : defaultAccountId;
    if (shouldPromptAccountIds && !override) {
      accountId = await promptAccountId({
        cfg,
        prompter,
        label: "Zulip",
        currentId: accountId,
        listAccountIds: listZulipAccountIds,
        defaultAccountId,
      });
    }

    let next = cfg;
    const resolvedAccount = resolveZulipAccount({
      cfg: next,
      accountId,
    });
    const accountConfigured = Boolean(
      resolvedAccount.botEmail && resolvedAccount.botToken && resolvedAccount.baseUrl,
    );
    const allowEnv = accountId === DEFAULT_ACCOUNT_ID;
    const canUseEnv =
      allowEnv &&
      Boolean(process.env.ZULIP_BOT_EMAIL?.trim()) &&
      Boolean(process.env.ZULIP_BOT_TOKEN?.trim()) &&
      Boolean(process.env.ZULIP_URL?.trim());
    const hasConfigValues =
      Boolean(resolvedAccount.config.botEmail) ||
      Boolean(resolvedAccount.config.botToken) ||
      Boolean(resolvedAccount.config.baseUrl);

    let botEmail: string | null = null;
    let botToken: string | null = null;
    let baseUrl: string | null = null;

    if (!accountConfigured) {
      await noteZulipSetup(prompter);
    }

    if (canUseEnv && !hasConfigValues) {
      const keepEnv = await prompter.confirm({
        message: "ZULIP_BOT_EMAIL + ZULIP_BOT_TOKEN + ZULIP_URL detected. Use env vars?",
        initialValue: true,
      });
      if (keepEnv) {
        next = {
          ...next,
          channels: {
            ...next.channels,
            zulip: {
              ...next.channels?.zulip,
              enabled: true,
            },
          },
        };
      } else {
        const entered = await promptZulipCredentials(prompter);
        botEmail = entered.botEmail;
        botToken = entered.botToken;
        baseUrl = entered.baseUrl;
      }
    } else if (accountConfigured) {
      const keep = await prompter.confirm({
        message: "Zulip credentials already configured. Keep them?",
        initialValue: true,
      });
      if (!keep) {
        const entered = await promptZulipCredentials(prompter);
        botEmail = entered.botEmail;
        botToken = entered.botToken;
        baseUrl = entered.baseUrl;
      }
    } else {
      const entered = await promptZulipCredentials(prompter);
      botEmail = entered.botEmail;
      botToken = entered.botToken;
      baseUrl = entered.baseUrl;
    }

    if (botEmail || botToken || baseUrl) {
      if (accountId === DEFAULT_ACCOUNT_ID) {
        next = {
          ...next,
          channels: {
            ...next.channels,
            zulip: {
              ...next.channels?.zulip,
              enabled: true,
              ...(botEmail ? { botEmail } : {}),
              ...(botToken ? { botToken } : {}),
              ...(baseUrl ? { baseUrl } : {}),
            },
          },
        };
      } else {
        next = {
          ...next,
          channels: {
            ...next.channels,
            zulip: {
              ...next.channels?.zulip,
              enabled: true,
              accounts: {
                ...next.channels?.zulip?.accounts,
                [accountId]: {
                  ...next.channels?.zulip?.accounts?.[accountId],
                  enabled: next.channels?.zulip?.accounts?.[accountId]?.enabled ?? true,
                  ...(botEmail ? { botEmail } : {}),
                  ...(botToken ? { botToken } : {}),
                  ...(baseUrl ? { baseUrl } : {}),
                },
              },
            },
          },
        };
      }
    }

    return { cfg: next, accountId };
  },
  disable: (cfg: OpenClawConfig) => ({
    ...cfg,
    channels: {
      ...cfg.channels,
      zulip: { ...cfg.channels?.zulip, enabled: false },
    },
  }),
};
