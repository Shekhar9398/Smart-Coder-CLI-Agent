#!/usr/bin/env node

import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import readline from "readline";
import Anthropic from "@anthropic-ai/sdk";
import { Command } from "commander";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import chalk from "chalk";
import ora from "ora";

/**
 * CORE LOGIC
 */

let isMCPMode = false;

const getConfig = () => {
    const configPath = path.join(os.homedir(), ".smartcoder", "config.json");
    if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
    return {};
};

const saveConfig = (config) => {
    const configDir = path.join(os.homedir(), ".smartcoder");
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(
        path.join(configDir, "config.json"),
        JSON.stringify(config, null, 2)
    );
};

/**
 * TECH STACK DETECTION
 */
const detectTechStack = (cwd) => {
    const files = fs.readdirSync(cwd);
    const allFiles = execSync(`find "${cwd}" -type f -name "*" 2>/dev/null | head -100`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
    })
        .split("\n")
        .map((f) => path.basename(f).toLowerCase())
        .filter(Boolean);

    const hasSwift = allFiles.some((f) => f.endsWith(".swift"));
    const hasKotlin = allFiles.some((f) => f.endsWith(".kt"));
    const hasPython = allFiles.some((f) => f.endsWith(".py"));
    const hasGo = allFiles.some((f) => f.endsWith(".go"));
    const hasPubspec = files.includes("pubspec.yaml");
    const hasPodfile = files.includes("Podfile");
    const hasGradle = files.includes("build.gradle");
    const hasPackageJson = files.includes("package.json");
    const hasRequirements = files.includes("requirements.txt");

    let packageJsonDeps = [];
    if (hasPackageJson) {
        try {
            const pkg = JSON.parse(
                fs.readFileSync(path.join(cwd, "package.json"), "utf-8")
            );
            packageJsonDeps = Object.keys({
                ...pkg.dependencies,
                ...pkg.devDependencies,
            }).map((d) => d.toLowerCase());
        } catch {
            // Ignore
        }
    }

    if (hasSwift) {
        return {
            stack: "swift",
            displayName: "iOS Developer",
            persona: "You are a senior iOS developer with deep UIKit/SwiftUI expertise. Think in terms of Apple HIG, Swift concurrency, Xcode workflows, and best practices for iOS development.",
        };
    }
    if (hasKotlin || hasGradle) {
        return {
            stack: "kotlin",
            displayName: "Android Developer",
            persona: "You are a senior Android developer with Jetpack, Compose, and coroutines expertise. Think in Material Design, lifecycle management, and Android platform conventions.",
        };
    }
    if (packageJsonDeps.includes("react-native")) {
        return {
            stack: "react-native",
            displayName: "React Native Developer",
            persona: "You are a cross-platform mobile developer with React Native, Expo, Metro bundler, and native module expertise.",
        };
    }
    if (hasPubspec) {
        return {
            stack: "flutter",
            displayName: "Flutter Developer",
            persona: "You are a senior Flutter developer with Dart, Widget trees, and pub.dev ecosystem expertise. Think in declarative UI, state management patterns, and platform-specific integrations.",
        };
    }
    if (packageJsonDeps.includes("next")) {
        return {
            stack: "nextjs",
            displayName: "Next.js Developer",
            persona: "You are a senior Next.js developer with expertise in server-side rendering, API routes, middleware, and modern React patterns.",
        };
    }
    if (packageJsonDeps.includes("react")) {
        return {
            stack: "react",
            displayName: "React Developer",
            persona: "You are a senior React developer with expertise in hooks, state management, component patterns, and modern frontend architecture.",
        };
    }
    if (
        packageJsonDeps.includes("express") ||
        packageJsonDeps.includes("fastify")
    ) {
        return {
            stack: "nodejs-backend",
            displayName: "Node.js Backend Developer",
            persona: "You are a senior backend Node.js developer with expertise in REST APIs, database design, middleware, and scalable server architecture.",
        };
    }
    if (hasPackageJson) {
        return {
            stack: "nodejs",
            displayName: "JavaScript Developer",
            persona: "You are a senior JavaScript developer with expertise in Node.js, npm ecosystem, and modern development practices.",
        };
    }
    if (hasPython || hasRequirements) {
        return {
            stack: "python",
            displayName: "Python Developer",
            persona: "You are a senior Python developer with expertise in multiple domains. Think in Python idioms, best practices, and ecosystem libraries.",
        };
    }
    if (hasGo) {
        return {
            stack: "go",
            displayName: "Go Developer",
            persona: "You are a senior Go developer with expertise in concurrency, interfaces, and systems programming.",
        };
    }
    if (hasPodfile) {
        return {
            stack: "ios",
            displayName: "iOS Developer",
            persona: "You are a senior iOS developer with deep UIKit/SwiftUI expertise. Think in terms of Apple HIG, Swift concurrency, and iOS best practices.",
        };
    }

    return {
        stack: "generic",
        displayName: "Software Developer",
        persona: "You are a senior software developer with broad technical expertise. Think like an experienced engineer: ask clarifying questions, spot mistakes, suggest better approaches, and plan solutions carefully.",
    };
};

/**
 * CONTEXT INJECTION HELPER
 */
const getProjectContext = (cwd) => {
    const stack = detectTechStack(cwd);
    let gitStatus = "";
    let recentFiles = "";
    let fileTree = "";

    try {
        gitStatus = execSync("git status --short", {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "ignore"],
            cwd,
        }).trim();
    } catch {
        gitStatus = "No git repo";
    }

    try {
        recentFiles = execSync("git diff HEAD~3 HEAD --name-only", {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "ignore"],
            cwd,
        })
            .trim()
            .split("\n")
            .filter(Boolean)
            .join(", ");
    } catch {
        recentFiles = "N/A";
    }

    const getTree = (dir, depth = 0, maxDepth = 1) => {
        if (depth > maxDepth) return [];
        try {
            return fs
                .readdirSync(dir)
                .filter(f => !["node_modules", ".git", "dist", "build", ".claude", ".thinkhead"].includes(f))
                .map(f => `${"  ".repeat(depth)}* ${f}`)
                .flat();
        } catch {
            return [];
        }
    };

    fileTree = getTree(cwd).join("\n");

    return { ...stack, gitStatus, recentFiles, fileTree };
};

/**
 * CLAUDE API HELPER
 */
const callClaude = async (systemPrompt, messages, stream = false) => {
    if (isMCPMode) {
        if (stream) {
            process.stdout.write("[Using Claude Code context]\n");
            return "[Using Claude Code context]";
        }
        return "[Claude Code analysis]";
    }

    const apiKey = process.env.ANTHROPIC_API_KEY || getConfig().apiKey;
    if (!apiKey) {
        throw new Error(
            "ANTHROPIC_API_KEY not set. Run 'smartcoder set-key YOUR_API_KEY' or set the environment variable."
        );
    }

    const client = new Anthropic({ apiKey });

    if (stream) {
        const stream = await client.messages.stream({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 2048,
            system: systemPrompt,
            messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
            })),
        });

        let fullResponse = "";
        for await (const chunk of stream) {
            if (
                chunk.type === "content_block_delta" &&
                chunk.delta.type === "text_delta"
            ) {
                const text = chunk.delta.text;
                process.stdout.write(text);
                fullResponse += text;
            }
        }
        process.stdout.write("\n");
        return fullResponse;
    } else {
        const response = await client.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 2048,
            system: systemPrompt,
            messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
            })),
        });

        return response.content[0].type === "text" ? response.content[0].text : "";
    }
};

const getProjectSummaryData = () => {
    const cwd = process.cwd();
    const stack = detectTechStack(cwd);

    const getTree = (dir, depth = 0, maxDepth = 2) => {
        if (depth > maxDepth) return [];
        try {
            return fs
                .readdirSync(dir)
                .filter(f => !["node_modules", ".git", "dist", "build"].includes(f))
                .map(f => `${"  ".repeat(depth)}* ${f}`)
                .flat();
        } catch {
            return [];
        }
    };

    const fileTree = getTree(cwd).join("\n");
    let recentCommits = "";
    try {
        recentCommits = execSync("git log --oneline -10", { encoding: "utf-8" }).trim();
    } catch {
        recentCommits = "No git history.";
    }

    return { ...stack, fileTree, recentCommits };
};

/**
 * MCP SERVER IMPLEMENTATION
 */

const server = new Server(
    {
        name: "smartcoder-server",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "get_day_report",
                description: "Generates an AI-analyzed summary of today's git commits and code changes with structured insights.",
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "get_project_summary",
                description: "Analyzes the project structure, tech stack, and file tree for a deep summary.",
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "get_developer_context",
                description: "Returns detected tech stack and developer persona for this project.",
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "get_code_review",
                description: "Performs a professional code review of current git changes.",
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "ask_question",
                description: "Ask a question about the project with full context injection.",
                inputSchema: {
                    type: "object",
                    properties: {
                        question: { type: "string" },
                    },
                    required: ["question"],
                },
            },
            {
                name: "get_suggestions",
                description: "Get concrete improvement suggestions for the project.",
                inputSchema: { type: "object", properties: {} },
            },
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, params } = request;

    try {
        if (name === "get_day_report") {
            const cwd = process.cwd();
            let commits = "";
            let fullMessages = "";
            let stats = "";
            let files = "";

            try {
                commits = execSync(
                    'git log --since="00:00:00" --oneline',
                    { encoding: "utf-8", cwd }
                ).trim();
                fullMessages = execSync(
                    'git log --since="00:00:00" --pretty=format:"%s%n%b"',
                    { encoding: "utf-8", cwd }
                ).trim();
                stats = execSync("git diff HEAD~5 HEAD --stat", {
                    encoding: "utf-8",
                    cwd,
                }).trim();
                files = execSync("git diff HEAD~5 HEAD --name-only", {
                    encoding: "utf-8",
                    cwd,
                }).trim();
            } catch {
                try {
                    stats = execSync("git diff --stat", { encoding: "utf-8", cwd }).trim();
                    files = execSync("git diff --name-only", {
                        encoding: "utf-8",
                        cwd,
                    }).trim();
                } catch {}
            }

            const rawData = `Git Commits:\n${commits || "No commits today"}\n\nFull Messages:\n${fullMessages || "N/A"}\n\nFile Changes:\n${stats || "No changes"}\n\nFiles Modified:\n${files || "N/A"}`;

            let analysis = "";
            try {
                analysis = await callClaude(
                    `You are a senior engineering lead reviewing a developer's daily work log.
Produce a PROFESSIONAL, STRUCTURED report with the following sections:

## 🚀 Features Shipped
## 🐛 Bugs Fixed
## 🏗️ Architecture & Refactors
## ⚠️ Tech Debt / Risks Introduced
## 🎯 Suggested Next Steps

Rules:
- Each bullet must be specific and actionable, not vague
- Include: WHAT was done + WHY it matters + IMPACT
- "Next Steps" must be concrete tasks for tomorrow
- Use bold for key terms
- If no commits today, analyze the diff and give insight`,
                    [{ role: "user", content: rawData }]
                );
            } catch (apiError) {
                analysis = "API Error (using raw display):\n" + rawData;
            }

            return {
                content: [{ type: "text", text: analysis }],
            };
        }

        if (name === "get_project_summary") {
            const data = getProjectSummaryData();
            const report = `${chalk.cyan.bold("-->>-- Project Summary --<<--\n")}
${chalk.green("-- Tech Stack --")}
${chalk.yellow(`* Stack: ${data.stack} (${data.displayName})\n`)}
${chalk.green("-- File Tree --")}
${data.fileTree}

${chalk.green("-- Recent History --")}
${data.recentCommits}`;
            return {
                content: [{ type: "text", text: report }],
            };
        }

        if (name === "get_developer_context") {
            const cwd = process.cwd();
            const stack = detectTechStack(cwd);
            const context = `${chalk.cyan.bold("-->>-- Developer Context --<<--\n")}
${chalk.green("-- Tech Stack --")}
${chalk.yellow(`* ${stack.stack}\n`)}
${chalk.green("-- Role --")}
${chalk.yellow(`* ${stack.displayName}\n`)}
${chalk.green("-- Persona --")}
${chalk.yellow(`* ${stack.persona}`)}`;
            return {
                content: [{ type: "text", text: context }],
            };
        }

        if (name === "get_code_review") {
            const cwd = process.cwd();
            let diff = "";
            try {
                diff = execSync("git diff HEAD", { encoding: "utf-8", cwd }).trim();
                if (!diff) {
                    diff = execSync("git diff --cached", { encoding: "utf-8", cwd }).trim();
                }
                if (!diff) {
                    diff = execSync("git diff HEAD~1 HEAD", { encoding: "utf-8", cwd }).trim();
                }
            } catch {
                return {
                    content: [{ type: "text", text: "No git changes to review." }],
                };
            }

            let review = "";
            try {
                review = await callClaude(
                    `You are a senior code reviewer with 15+ years of experience.
Review the following git diff and produce a PROFESSIONAL review:

## 🔴 Critical Issues (must fix before merge)
## 🟠 Warnings (should address)
## 🟡 Suggestions (nice to have)
## ✅ What's Done Well
## 📋 Summary Verdict: APPROVE / REQUEST CHANGES / NEEDS DISCUSSION

Rules:
- Be specific: cite exact line/function names
- Security issues are ALWAYS critical
- Performance issues >10% impact are warnings
- Style issues are suggestions only
- End with a clear verdict`,
                    [{ role: "user", content: diff }]
                );
            } catch (apiError) {
                review = "API Error: could not review diff.";
            }

            return {
                content: [{ type: "text", text: review }],
            };
        }

        if (name === "ask_question") {
            const { question } = params.params;
            const cwd = process.cwd();
            const context = getProjectContext(cwd);

            let answer = "";
            try {
                answer = await callClaude(
                    `You are a ${context.displayName} pair programmer embedded in this project.

PROJECT CONTEXT:
- Tech Stack: ${context.stack}
- Recent files changed: ${context.recentFiles}
- Git status: ${context.gitStatus}
- File tree:
${context.fileTree}

YOUR BEHAVIOR:
- Give production-quality, battle-tested answers
- Always include code examples when relevant
- Mention edge cases and potential pitfalls
- Structure: Answer → Code Example → Caveats → Alternatives
- Be concise but thorough — no filler text
- If the question is ambiguous, ask ONE clarifying question`,
                    [{ role: "user", content: question }]
                );
            } catch (apiError) {
                answer = "API Error: could not answer question.";
            }

            return {
                content: [{ type: "text", text: answer }],
            };
        }

        if (name === "get_suggestions") {
            const cwd = process.cwd();
            const data = getProjectSummaryData();
            const rawData = `File Tree:\n${data.fileTree}\n\nTech Stack: ${data.stack} (${data.displayName})\n\nRecent commits:\n${data.recentCommits}`;

            let suggestions = "";
            try {
                suggestions = await callClaude(
                    `You are a senior software architect reviewing this project.
Based on the project structure, tech stack, and recent history, give CONCRETE improvement suggestions:

## 🏆 Quick Wins (< 1 day effort)
## 📦 Medium Improvements (1-3 days)
## 🔭 Strategic Investments (1+ week)
## 🔒 Security Hardening
## ⚡ Performance Opportunities

Rules:
- Each suggestion must include: WHAT + WHY + HOW (brief steps)
- Prioritize by impact/effort ratio
- Reference specific files when possible`,
                    [{ role: "user", content: rawData }]
                );
            } catch (apiError) {
                suggestions = "API Error: could not generate suggestions.";
            }

            return {
                content: [{ type: "text", text: suggestions }],
            };
        }

        throw new Error(`Tool not found: ${name}`);
    } catch (error) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true,
        };
    }
});

/**
 * CLI COMMANDS
 */
const program = new Command();

program
    .command("dayreport")
    .description("Generate an AI-powered summary of today's git activity")
    .action(async () => {
        try {
            const cwd = process.cwd();
            let commits = "";
            let fullMessages = "";
            let stats = "";
            let files = "";

            try {
                commits = execSync(
                    'git log --since="00:00:00" --oneline',
                    { encoding: "utf-8" }
                ).trim();
                fullMessages = execSync(
                    'git log --since="00:00:00" --pretty=format:"%s%n%b"',
                    { encoding: "utf-8" }
                ).trim();
                stats = execSync("git diff HEAD~5 HEAD --stat", {
                    encoding: "utf-8",
                }).trim();
                files = execSync("git diff HEAD~5 HEAD --name-only", {
                    encoding: "utf-8",
                }).trim();
            } catch {
                try {
                    stats = execSync("git diff --stat", { encoding: "utf-8" }).trim();
                    files = execSync("git diff --name-only", {
                        encoding: "utf-8",
                    }).trim();
                } catch {}
            }

            const rawData = `Git Commits:\n${commits || "No commits today"}\n\nFull Messages:\n${fullMessages || "N/A"}\n\nFile Changes:\n${stats || "No changes"}\n\nFiles Modified:\n${files || "N/A"}`;

            console.log("\n" + chalk.cyan.bold("-->>-- Today's Work Report --<<--\n"));
            const spinner = ora(chalk.blue("Analyzing commits...")).start();

            try {
                const analysis = await callClaude(
                    `You are a senior engineering lead reviewing a developer's daily work log.
Produce a PROFESSIONAL, STRUCTURED report with the following sections:

## 🚀 Features Shipped
## 🐛 Bugs Fixed
## 🏗️ Architecture & Refactors
## ⚠️ Tech Debt / Risks Introduced
## 🎯 Suggested Next Steps

Rules:
- Each bullet must be specific and actionable, not vague
- Include: WHAT was done + WHY it matters + IMPACT
- "Next Steps" must be concrete tasks for tomorrow
- Use bold for key terms
- If no commits today, analyze the diff and give insight`,
                    [{ role: "user", content: rawData }]
                );
                spinner.succeed(chalk.green("Analysis complete"));
                console.log(analysis);
            } catch (apiError) {
                spinner.fail(chalk.red("API unavailable"));
                console.log(chalk.yellow("Raw git data:"));
                console.log(rawData);
            }
            console.log("");
        } catch (error) {
            console.error(chalk.red("Error generating day report:"), error.message);
            process.exit(1);
        }
    });

program
    .command("summary")
    .description("Get a detailed technical overview of your project")
    .action(() => {
        try {
            const data = getProjectSummaryData();
            console.log("\n" + chalk.cyan.bold("-->>-- Project Summary --<<--\n"));
            console.log(chalk.green("-- Tech Stack --"));
            console.log(chalk.yellow(`* ${data.stack} (${data.displayName})\n`));
            console.log(chalk.green("-- File Tree --"));
            console.log(data.fileTree);
            console.log("\n" + chalk.green("-- Recent History --"));
            console.log(data.recentCommits);
            console.log("");
        } catch (error) {
            console.error(chalk.red("Error generating summary:"), error.message);
            process.exit(1);
        }
    });

program
    .command("developer [subcommand]")
    .description("Start interactive developer mode (use 'mode' to enter interactive session)")
    .action(async (subcommand) => {
        const cwd = process.cwd();
        const context = getProjectContext(cwd);

        if (subcommand === "mode") {
            console.log("\n" + chalk.cyan.bold("-->>-- Developer Mode --<<--\n"));
            console.log(chalk.green(`-- Acting as ${context.displayName} --\n`));
            console.log(
                chalk.yellow(
                    `* Type your questions or commands.\n* Type '/exit' or leave empty to quit.\n`
                )
            );

            const conversationHistory = [];
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
            });

            const askQuestion = () => {
                rl.question(chalk.blue("> "), async (input) => {
                    if (!input || input.toLowerCase() === "/exit") {
                        console.log(chalk.green("\nGoodbye!"));
                        rl.close();
                        return;
                    }

                    conversationHistory.push({
                        role: "user",
                        content: input,
                    });

                    try {
                        const systemPrompt = `You are a ${context.displayName} pair programmer embedded in this project.

PROJECT CONTEXT:
- Tech Stack: ${context.stack}
- Recent files changed: ${context.recentFiles}
- Git status: ${context.gitStatus}
- File tree:
${context.fileTree}

YOUR BEHAVIOR:
- Give production-quality, battle-tested answers
- Always include code examples when relevant
- Mention edge cases and potential pitfalls
- Structure: Answer → Code Example → Caveats → Alternatives
- Be concise but thorough — no filler text
- If the question is ambiguous, ask ONE clarifying question`;

                        const response = await callClaude(
                            systemPrompt,
                            conversationHistory,
                            true
                        );

                        conversationHistory.push({
                            role: "assistant",
                            content: response,
                        });

                        askQuestion();
                    } catch (error) {
                        console.error(
                            chalk.red(`Error: ${error.message}`)
                        );
                        askQuestion();
                    }
                });
            };

            askQuestion();
        } else {
            console.log("\n" + chalk.cyan.bold("-->>-- Developer Context --<<--\n"));
            console.log(chalk.yellow(`* Tech Stack: ${context.stack}`));
            console.log(chalk.yellow(`* Role: ${context.displayName}`));
            console.log(
                chalk.yellow(`\n* Use 'smartcoder developer mode' to start interactive session.\n`)
            );
        }
    });

program
    .command("ask <question>")
    .description("Ask a question about the project with full context")
    .action(async (question) => {
        try {
            const cwd = process.cwd();
            const context = getProjectContext(cwd);

            console.log("\n" + chalk.cyan.bold("-->>-- Asking Question --<<--\n"));
            const spinner = ora(chalk.blue("Thinking...")).start();

            try {
                const systemPrompt = `You are a ${context.displayName} pair programmer embedded in this project.

PROJECT CONTEXT:
- Tech Stack: ${context.stack}
- Recent files changed: ${context.recentFiles}
- Git status: ${context.gitStatus}
- File tree:
${context.fileTree}

YOUR BEHAVIOR:
- Give production-quality, battle-tested answers
- Always include code examples when relevant
- Mention edge cases and potential pitfalls
- Structure: Answer → Code Example → Caveats → Alternatives
- Be concise but thorough — no filler text`;

                spinner.stop();
                const answer = await callClaude(
                    systemPrompt,
                    [{ role: "user", content: question }],
                    true
                );
                console.log("");
            } catch (apiError) {
                spinner.fail(chalk.red("API Error"));
                console.log(chalk.red(apiError.message));
            }
        } catch (error) {
            console.error(chalk.red("Error:"), error.message);
            process.exit(1);
        }
    });

program
    .command("review")
    .description("Perform a professional code review of current changes")
    .action(async () => {
        try {
            const cwd = process.cwd();
            let diff = "";

            try {
                diff = execSync("git diff HEAD", { encoding: "utf-8" }).trim();
                if (!diff) {
                    diff = execSync("git diff --cached", { encoding: "utf-8" }).trim();
                }
                if (!diff) {
                    diff = execSync("git diff HEAD~1 HEAD", { encoding: "utf-8" }).trim();
                }
            } catch {
                console.log(chalk.yellow("No git changes to review."));
                return;
            }

            if (!diff) {
                console.log(chalk.yellow("No git changes to review."));
                return;
            }

            console.log("\n" + chalk.cyan.bold("-->>-- Code Review --<<--\n"));
            const spinner = ora(chalk.blue("Reviewing code...")).start();

            try {
                const review = await callClaude(
                    `You are a senior code reviewer with 15+ years of experience.
Review the following git diff and produce a PROFESSIONAL review:

## 🔴 Critical Issues (must fix before merge)
## 🟠 Warnings (should address)
## 🟡 Suggestions (nice to have)
## ✅ What's Done Well
## 📋 Summary Verdict: APPROVE / REQUEST CHANGES / NEEDS DISCUSSION

Rules:
- Be specific: cite exact line/function names
- Security issues are ALWAYS critical
- Performance issues >10% impact are warnings
- Style issues are suggestions only
- End with a clear verdict`,
                    [{ role: "user", content: diff }]
                );
                spinner.succeed(chalk.green("Review complete"));
                console.log(review);
            } catch (apiError) {
                spinner.fail(chalk.red("API Error"));
                console.log(chalk.red(apiError.message));
            }
            console.log("");
        } catch (error) {
            console.error(chalk.red("Error:"), error.message);
            process.exit(1);
        }
    });

program
    .command("explain [file]")
    .description("Explain a file or the project structure with AI")
    .action(async (file) => {
        try {
            const cwd = process.cwd();
            let content = "";
            let targetName = "Project";

            if (file) {
                const filePath = path.join(cwd, file);
                if (!fs.existsSync(filePath)) {
                    console.log(chalk.red(`File not found: ${file}`));
                    process.exit(1);
                }
                content = fs.readFileSync(filePath, "utf-8");
                targetName = path.basename(file);
            } else {
                const data = getProjectSummaryData();
                content = `File Tree:\n${data.fileTree}\n\nTech Stack: ${data.stack} (${data.displayName})\n\nRecent commits:\n${data.recentCommits}`;
            }

            console.log("\n" + chalk.cyan.bold(`-->>-- Explaining ${targetName} --<<--\n`));
            const spinner = ora(chalk.blue("Analyzing...")).start();

            try {
                spinner.stop();
                const explanation = await callClaude(
                    `You are a senior developer creating technical documentation.
Explain the following code/file:

## 📋 Purpose & Responsibilities
## 🔄 How It Works (step-by-step flow)
## 🔗 Dependencies & Integrations
## ⚠️ Important Caveats / Gotchas
## 💡 Usage Examples

Be clear enough for a mid-level developer joining the project today.`,
                    [{ role: "user", content: content }],
                    true
                );
                console.log("");
            } catch (apiError) {
                spinner.fail(chalk.red("API Error"));
                console.log(chalk.red(apiError.message));
            }
        } catch (error) {
            console.error(chalk.red("Error:"), error.message);
            process.exit(1);
        }
    });

program
    .command("suggest")
    .description("Get concrete improvement suggestions for the project")
    .action(async () => {
        try {
            const cwd = process.cwd();
            const data = getProjectSummaryData();
            const rawData = `File Tree:\n${data.fileTree}\n\nTech Stack: ${data.stack} (${data.displayName})\n\nRecent commits:\n${data.recentCommits}`;

            console.log("\n" + chalk.cyan.bold("-->>-- Project Suggestions --<<--\n"));
            const spinner = ora(chalk.blue("Analyzing project...")).start();

            try {
                spinner.stop();
                const suggestions = await callClaude(
                    `You are a senior software architect reviewing this project.
Based on the project structure, tech stack, and recent history, give CONCRETE improvement suggestions:

## 🏆 Quick Wins (< 1 day effort)
## 📦 Medium Improvements (1-3 days)
## 🔭 Strategic Investments (1+ week)
## 🔒 Security Hardening
## ⚡ Performance Opportunities

Rules:
- Each suggestion must include: WHAT + WHY + HOW (brief steps)
- Prioritize by impact/effort ratio
- Reference specific files when possible`,
                    [{ role: "user", content: rawData }],
                    true
                );
                console.log("");
            } catch (apiError) {
                spinner.fail(chalk.red("API Error"));
                console.log(chalk.red(apiError.message));
            }
        } catch (error) {
            console.error(chalk.red("Error:"), error.message);
            process.exit(1);
        }
    });

program
    .command("set-key <apiKey>")
    .description("Set your Anthropic API key")
    .action((apiKey) => {
        try {
            saveConfig({ apiKey });
            console.log(
                chalk.green(
                    "\n✓ API key saved to ~/.smartcoder/config.json\n"
                )
            );
        } catch (error) {
            console.error(chalk.red("Error saving API key:"), error.message);
            process.exit(1);
        }
    });

program
    .command("init")
    .description("Initialize smartcoder configuration")
    .action(() => {
        try {
            const configDir = path.join(os.homedir(), ".smartcoder");
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
                console.log(chalk.green(`\n✓ Created ${configDir}\n`));
            } else {
                console.log(chalk.yellow(`\n✓ ${configDir} already exists\n`));
            }
            console.log(chalk.cyan("Next: run 'smartcoder set-key YOUR_API_KEY'\n"));
        } catch (error) {
            console.error(chalk.red("Error:"), error.message);
            process.exit(1);
        }
    });

/**
 * START THE SERVER
 */
async function main() {
    if (process.argv.length > 2) {
        await program.parse();
        return;
    }

    isMCPMode = true;
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    process.stderr.write(`Server error: ${error.message}\n`);
    process.exit(1);
});
