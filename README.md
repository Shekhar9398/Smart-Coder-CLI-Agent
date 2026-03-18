-->>-- SmartCoder CLI --<<--

A lightweight AI agent for project summaries and daily developer reports.

-- Installation --

Install the package via GitHub URL:

```bash
npm install -g git+https://github.com/Shekhar9398/Smart-Coder-CLI-Agent.git
```

-- Setup --

Set your Claude API key for AI-powered insights:

```bash
smartcoder set-key YOUR_API_KEY
```

-- Available Commands --

Core Commands:
* dayreport: Generate an AI-powered summary of today's git activity with detailed impact analysis
* summary: Get a detailed technical overview of your project (tech stack, file tree, git history)
* developer [subcommand]: Start interactive developer mode with context-aware pair programming

Advanced Commands:
* ask "<question>": Ask a question about the project with full project context injected
* review: Perform a professional code review of current git changes (critical/warning/suggestion levels)
* explain [file]: Explain a file or the project architecture with structured documentation
* suggest: Get concrete improvement suggestions (quick wins, medium, strategic investments)

Configuration:
* set-key <apiKey>: Set your Anthropic API key for Claude API calls
* init: Initialize smartcoder configuration directory

-- Features --

✨ Professional Output:
- Colored terminal output (using chalk) with clear visual hierarchy
- Spinners for long-running API calls
- Structured markdown formatting with emoji indicators
- Beautiful ASCII headers and section dividers

🧠 Advanced AI Prompts:
- Senior-level engineering personas tailored to your tech stack
- Automatic project context injection (tech stack, recent files, git status)
- Structured output formats enforcing quality and actionability
- Production-quality code examples and best practices

🔧 Tech Stack Detection:
- Automatic detection of 10+ tech stacks (iOS, Android, React, Node.js, Python, Go, etc.)
- Tailored AI personas for each stack
- Context-aware recommendations and explanations

-- Requirements --

* Node.js >= 18
* Run inside a git repository for git-based commands
* Anthropic API key for Claude API calls (set via 'smartcoder set-key')
* Optional: Claude Code premium for automatic integration (no API key needed)
