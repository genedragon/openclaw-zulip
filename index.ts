import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { zulipPlugin } from "./src/channel.js";
import { setZulipRuntime } from "./src/runtime.js";
import { createFetchMessagesTool, createDownloadFileTool } from "./src/zulip/tools.js";

const plugin = {
  id: "zulip",
  name: "Zulip",
  description: "Zulip channel plugin with history fetch and file download tools",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setZulipRuntime(api.runtime);
    api.registerChannel({ plugin: zulipPlugin });

    // Register agent tools for Zulip history and file access
    api.registerTool(createFetchMessagesTool(), {
      name: "zulip_fetch_messages",
    });
    api.registerTool(createDownloadFileTool(), {
      name: "zulip_download_file",
    });
  },
};

export default plugin;
