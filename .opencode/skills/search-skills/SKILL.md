---
name: search-skills
description: Search for and install new agent skills using the npx skills CLI
---

# Search and Manage Skills

This skill enables the agent to discover, install, and manage reusable behaviors (skills) using the `npx skills` CLI tool.

## Capabilities

### 1. Discovering Skills
- **Search by keyword**: Use `npx skills find <query>` to search for skills across the ecosystem.
- **Explore a repository**: Use `npx skills add <owner/repo> --list` to list all available skills in a specific GitHub repository (e.g., `vercel-labs/agent-skills`).

### 2. Installing Skills
- **Install a specific skill**: Use `npx skills add <owner/repo> --skill <skill-name> -a opencode`.
- **Install all skills from a repo**: Use `npx skills add <owner/repo> --all -a opencode`.
- **Install globally**: Add the `-g` flag to install the skill for all projects.

### 3. Managing Installed Skills
- **List installed skills**: Use `npx skills list` (or `ls`).
- **Update skills**: Use `npx skills update` to bring installed skills to their latest version.
- **Remove a skill**: Use `npx skills remove <skill-name>`.

### 4. Creating New Skills
- **Initialize a template**: Use `npx skills init <name>` to create a new `SKILL.md` structure.

## Workflow
1. **Identify Need**: When a task is complex or recurring, first search for an existing skill using `npx skills find`.
2. **Verify**: List the skills in the found repository to ensure the right one is selected.
3. **Deploy**: Install the skill specifically for the `opencode` agent.
4. **Apply**: Once installed, the agent can load the skill using the `skill` tool.
