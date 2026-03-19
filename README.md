# SmartCoder CLI Tool #
* SmartCoder is an AI-powered CLI tool designed to bridge the gap between your local codebase and Claude AI. It provides instant technical summaries, code reviews, and an interactive pair-programming environment with full project context. 


# Quick Start
Prerequisites
* Node.js: v18.0.0 or higher
* Git: Active repository for tracking changes and history
* Anthropic API Key: Required for AI processing

# Installation
Choose your preferred installation method:
Bash

# Local installation
npm install smartcoder-cli-tool-by-shekhar

# Global installation
npm install -g smartcoder-cli-tool-by-shekhar
Configuration
Before your first run, initialize the tool and add your API key:
Bash

npx smartcoder init
npx smartcoder set-key <your_anthropic_api_key>

# Available Commands
Command	Description
* npx smartcoder summary	Detailed technical overview (stack, file tree, history).
* npx smartcoder developer mode	Starts an interactive AI pair-programming session.
* npx smartcoder day report	Professional AI summary of today's Git activity.
* npx smartcoder review	AI code review of current uncommitted changes.
* npx smartcoder explain [file]	Explains a specific file or the general project structure.
* npx smartcoder ask <question>	Ask a specific question with AI-injected project context.
* npx smartcoder suggest	Get Quick Wins, Strategic, and Security suggestions.

# Configuration Details
SmartCoder stores your settings and API keys locally for security:
* Path: ~/.smartcoder/config.json

# Contributing
Feel free to submit issues or pull requests to improve the SmartCoder experience.
Author: Shekhar
License: MIT
