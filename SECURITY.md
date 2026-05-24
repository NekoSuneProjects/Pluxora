# Security and Stability Guide

## Plugin Trust Model

Plugins execute JavaScript in the same Node.js process as the bot. That means a malicious plugin can access process memory, environment variables, the filesystem permitted to the process, and network APIs.

This project reduces risk with:

- Manifest validation
- Plugin ID validation
- Allowed remote plugin hosts
- ZIP path traversal checks
- Plugin-local `node_modules`
- Dependency install timeouts
- `npm install --ignore-scripts` by default
- Plugin permission manifest checks for commands and Discord events
- Error isolation around commands, events, dashboard hooks, and lifecycle hooks

These controls are not equivalent to a VM, container, or OS sandbox.

## Production Recommendations

- Keep `security.allowUntrustedPluginInstall` set to `false`
- Keep `plugins.dependencyInstall.ignoreScripts` set to `true`
- Restrict `security.allowedPluginHosts` to repositories you control
- Treat GitHub discovery results as untrusted candidates until reviewed
- Review plugin update diffs before updating production bots
- Require code review before enabling new plugins
- Run the bot under a dedicated OS user with minimal filesystem permissions
- Store secrets only in environment variables or a secret manager
- Do not give dashboard access to regular guild moderators
- Use HTTPS and secure cookies behind a reverse proxy in production
- Keep `dashboard.allowAnyAuthenticatedUser` set to `false`
- Use guild slash command registration during development and global registration only for stable releases

## Dashboard OAuth

The dashboard checks authenticated Discord IDs against:

- `dashboard.adminUserIds`
- `discord.ownerIds`

Users who authenticate successfully but are not listed are denied.

## Dependency Installation

The dependency installer runs inside the plugin directory. By default it omits dev dependencies and ignores install scripts:

```text
npm install --no-audit --no-fund --omit=dev --ignore-scripts
```

Some media or native dependencies may require install scripts. Only disable `ignoreScripts` for plugins you trust.

## GitHub Discovery

The dashboard and `pluginsearch` command query GitHub repositories with the hardcoded `pluxora-package` topic. Request parameters and config values cannot override the discovery topic.

Repositories published under that topic must follow `TERMS.md`. Unsafe plugins may be removed from discovery, reported, or refused support if they contain malware, token theft, IP grabbing, hidden data collection, abuse tooling, illegal content, or other dangerous behavior.

Discovery does not prove a repository is safe or compatible. Installation still clones and validates the plugin package shape, but it does not sandbox arbitrary JavaScript. Set `GITHUB_TOKEN` only if you need higher GitHub API rate limits, and use a token with the lowest practical permissions.

Update checks read the remote GitHub repository metadata and `package.json`. An update can be flagged because the plugin version increased or because GitHub shows the repository was pushed after the currently installed source timestamp. This is useful for catching repositories that forgot to bump versions, but it also means maintainers should still review changes before applying updates.

## Fault Isolation

Plugin command, event, dashboard, and lifecycle errors are caught and logged. A failing plugin should not crash the bot core. Load failures mark the plugin as `failed` in `config/plugins.json` and the dashboard.

## Recommended Deployment

- Run `npm ci` for core dependencies
- Run behind nginx, Caddy, or another HTTPS reverse proxy
- Set `DASHBOARD_SESSION_SECRET`
- Set `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and `DISCORD_CLIENT_SECRET` from the host environment
- Use `npm run start:watchdog` or a real process supervisor such as systemd, PM2, Docker, or Kubernetes
- Back up `config/`, `plugins/`, and `data/`
