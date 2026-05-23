const { searchGithubPluginRepositories } = require('../utils/githubDiscovery');

function parseConfigValue(raw) {
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function registerCoreCommands({ commandManager, pluginManager, configManager, requestRestart }) {
  commandManager.registerCommand('core', {
    name: 'plugins',
    description: 'List installed plugins and their status.',
    aliases: ['plugin-list'],
    cooldownMs: 1000,
    async execute(ctx) {
      const plugins = pluginManager.listPlugins();
      if (!plugins.length) return ctx.reply('No plugins are installed.');

      const lines = plugins.map((plugin) => {
        const marker = plugin.loaded ? 'loaded' : plugin.status;
        return `${plugin.id} (${plugin.enabled ? 'enabled' : 'disabled'}, ${marker})`;
      });

      return ctx.reply(`Installed plugins:\n${lines.join('\n')}`);
    }
  });

  commandManager.registerCommand('core', {
    name: 'plugin',
    description: 'Manage a plugin.',
    ownerOnly: true,
    cooldownMs: 1000,
    options: [
      {
        name: 'action',
        description: 'Plugin action',
        type: 'string',
        required: true,
        choices: [
          { name: 'enable', value: 'enable' },
          { name: 'disable', value: 'disable' },
          { name: 'reload', value: 'reload' },
          { name: 'update', value: 'update' },
          { name: 'check-update', value: 'check-update' },
          { name: 'check-updates', value: 'check-updates' },
          { name: 'uninstall', value: 'uninstall' },
          { name: 'status', value: 'status' },
          { name: 'sync-commands', value: 'sync-commands' }
        ]
      },
      {
        name: 'id',
        description: 'Plugin id',
        type: 'string',
        required: false
      }
    ],
    async execute(ctx) {
      const action = ctx.options.action || ctx.args[0];
      const pluginId = ctx.options.id || ctx.args[1];

      if (!action) return ctx.reply('Usage: plugin <enable|disable|reload|update|check-update|check-updates|uninstall|status|sync-commands> [plugin-id]');

      if (action === 'sync-commands') {
        await commandManager.syncSlashCommands();
        return ctx.reply('Slash command sync requested.');
      }

      if (action === 'check-updates') {
        const results = await pluginManager.checkAllPluginUpdates();
        if (!results.length) return ctx.reply('No GitHub-installed plugins were found.');
        const lines = results.map((result) => {
          if (result.error) return `${result.id}: check failed - ${result.error}`;
          const marker = result.updateAvailable ? 'update available' : 'current';
          return `${result.id}: ${marker} (${result.currentVersion || '?'} -> ${result.latestVersion || '?'})`;
        });
        return ctx.reply(lines.join('\n'));
      }

      if (!pluginId) return ctx.reply('Plugin id is required for this action.');

      if (action === 'enable') {
        await pluginManager.enablePlugin(pluginId);
        return ctx.reply(`Plugin "${pluginId}" enabled.`);
      }

      if (action === 'disable') {
        await pluginManager.disablePlugin(pluginId);
        return ctx.reply(`Plugin "${pluginId}" disabled.`);
      }

      if (action === 'reload') {
        await pluginManager.reloadPlugin(pluginId);
        return ctx.reply(`Plugin "${pluginId}" reloaded.`);
      }

      if (action === 'check-update') {
        const result = await pluginManager.checkPluginUpdate(pluginId);
        if (result.message) return ctx.reply(result.message);
        const marker = result.updateAvailable ? 'available' : 'not available';
        return ctx.reply(`Plugin "${pluginId}" update ${marker}: ${result.currentVersion} -> ${result.latestVersion} (${result.updateReason}).`);
      }

      if (action === 'update') {
        const plugin = await pluginManager.updatePlugin(pluginId);
        return ctx.reply(`Plugin "${pluginId}" updated to ${plugin.version}.`);
      }

      if (action === 'uninstall') {
        await pluginManager.uninstallPlugin(pluginId);
        return ctx.reply(`Plugin "${pluginId}" uninstalled.`);
      }

      if (action === 'status') {
        const plugin = pluginManager.listPlugins().find((item) => item.id === pluginId);
        if (!plugin) return ctx.reply(`Plugin "${pluginId}" is not installed.`);
        return ctx.reply(JSON.stringify(plugin, null, 2));
      }

      return ctx.reply(`Unknown plugin action "${action}".`);
    }
  });

  commandManager.registerCommand('core', {
    name: 'pluginsearch',
    description: 'Find plugin repositories on GitHub by topic.',
    ownerOnly: true,
    cooldownMs: 5000,
    options: [
      {
        name: 'query',
        description: 'Optional keywords to narrow results',
        type: 'string',
        required: false
      },
      {
        name: 'topic',
        description: 'GitHub topic to search',
        type: 'string',
        required: false
      }
    ],
    async execute(ctx) {
      const discoveryConfig = configManager.getCore('plugins.discovery.github', {});
      if (discoveryConfig.enabled === false) return ctx.reply('GitHub plugin discovery is disabled.');

      const result = await searchGithubPluginRepositories({
        topic: ctx.options.topic || discoveryConfig.topic,
        query: ctx.options.query || ctx.args.join(' '),
        limit: 5,
        defaultLimit: discoveryConfig.defaultLimit,
        sort: discoveryConfig.sort,
        order: discoveryConfig.order
      });

      if (!result.repositories.length) {
        return ctx.reply(`No repositories found for ${result.query}.`);
      }

      const lines = result.repositories.map((repository, index) => {
        return `${index + 1}. ${repository.fullName} (${repository.stars} stars)\n${repository.cloneUrl}`;
      });

      return ctx.reply(`GitHub plugin results for ${result.query}:\n${lines.join('\n')}`);
    }
  });

  commandManager.registerCommand('core', {
    name: 'botsettings',
    description: 'Read or update core bot settings.',
    ownerOnly: true,
    cooldownMs: 1000,
    options: [
      {
        name: 'action',
        description: 'get or set',
        type: 'string',
        required: true,
        choices: [
          { name: 'get', value: 'get' },
          { name: 'set', value: 'set' }
        ]
      },
      {
        name: 'path',
        description: 'Dotted config path, such as bot.prefix',
        type: 'string',
        required: true
      },
      {
        name: 'value',
        description: 'JSON value for set',
        type: 'string',
        required: false
      }
    ],
    async execute(ctx) {
      const action = ctx.options.action || ctx.args[0];
      const configPath = ctx.options.path || ctx.args[1];
      const value = ctx.options.value ?? ctx.args.slice(2).join(' ');

      if (!action || !configPath) return ctx.reply('Usage: botsettings <get|set> <path> [json-value]');

      if (action === 'get') {
        return ctx.reply(JSON.stringify(configManager.getCore(configPath), null, 2));
      }

      if (action === 'set') {
        await configManager.setCore(configPath, parseConfigValue(value));
        return ctx.reply(`Updated core setting "${configPath}".`);
      }

      return ctx.reply(`Unknown settings action "${action}".`);
    }
  });

  commandManager.registerCommand('core', {
    name: 'botrestart',
    description: 'Gracefully restart the bot process when running under the watchdog.',
    ownerOnly: true,
    cooldownMs: 5000,
    async execute(ctx) {
      await ctx.reply('Restart requested. The process will exit with code 42.');
      requestRestart();
    }
  });
}

module.exports = { registerCoreCommands };
