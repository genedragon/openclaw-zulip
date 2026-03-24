import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { zulipPlugin } from "./src/channel.js";
import { setZulipRuntime } from "./src/runtime.js";
import {
  createFetchMessagesTool,
  createDownloadFileTool,
  createReactLoopStartTool,
  createReactLoopStopTool,
  createReactLoopListTool,
} from "./src/zulip/tools.js";

const plugin = {
  id: "zulip",
  name: "Zulip",
  description: "Zulip channel plugin with history fetch, file download, and thinking reaction tools",
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

    // Register thinking reaction loop tools
    api.registerTool(createReactLoopStartTool(), {
      name: "zulip_react_loop_start",
    });
    api.registerTool(createReactLoopStopTool(), {
      name: "zulip_react_loop_stop",
    });
    api.registerTool(createReactLoopListTool(), {
      name: "zulip_react_loop_list",
    });
  },
};

export default plugin;
