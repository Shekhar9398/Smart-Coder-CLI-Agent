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

/**
 * CORE LOGIC (REUSED FROM YOUR ORIGINAL)
 */

// Flag to detect if running as MCP server (Claude Code integration)
let isMCPMode = false;

const getConfig = () => {
    const configPath = path.join(os.homedir(), ".smartcoder", "config.json");
    if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
    return {};
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

    // Check for file extensions
    const hasSwift = allFiles.some((f) => f.endsWith(".swift"));
    const hasKotlin = allFiles.some((f) => f.endsWith(".kt"));
    const hasPython = allFiles.some((f) => f.endsWith(".py"));
    const hasGo = allFiles.some((f) => f.endsWith(".go"));

    // Check for config files
    const hasPubspec = files.includes("pubspec.yaml");
    const hasPodfile = files.includes("Podfile");
    const hasGradle = files.includes("build.gradle");
    const hasPackageJson = files.includes("package.json");
    const hasRequirements = files.includes("requirements.txt");

    // Parse package.json for deps
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
            // Ignore parse errors
        }
    }

    // Detect stack
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
 * CLAUDE API HELPER
 */
const callClaude = async (systemPrompt, messages, stream = false) => {
    // If running as MCP server (Claude Code premium), we don't need API key
    // Claude Code will handle the API calls itself
    if (isMCPMode) {
        // In MCP mode, return a message indicating we're delegating to Claude Code
        if (stream) {
            process.stdout.write("[Using Claude Code context]\n");
            return "[Using Claude Code context]";
        }
        return "[Claude Code analysis]";
    }

    const apiKey = process.env.ANTHROPIC_API_KEY || getConfig().apiKey;
    if (!apiKey) {
        throw new Error(
            "ANTHROPIC_API_KEY not set. Set the environment variable, add apiKey to ~/.smartcoder/config.json, or use Claude Code premium for automatic integration."
        );
    }

    const client = new Anthropic({ apiKey });

    if (stream) {
        // For streaming (developer mode)
        const stream = await client.messages.stream({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 1024,
            system: systemPrompt,
            messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
            })),
        });

        // Stream the response text
        let fullResponse = "";
        process.stdout.write("");
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
        // For non-streaming (dayreport)
        const response = await client.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 1024,
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
            return fs.readdirSync(dir)
                .filter(f => !["node_modules", ".git", "dist", "build"].includes(f))
                .map(f => {
                    const fullPath = path.join(dir, f);
                    const isDir = fs.statSync(fullPath).isDirectory();
                    return `${"  ".repeat(depth)}${isDir ? "📁" : "📄"} ${f}`;
                }).flat();
        } catch { return []; }
    };

    const fileTree = getTree(cwd).join("\n");
    let recentCommits = "";
    try {
        recentCommits = execSync("git log --oneline -10", { encoding: "utf-8" }).trim();
    } catch { recentCommits = "No git history."; }

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

// 1. Tell Claude what tools are available
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
        ],
    };
});

// 2. Handle the tool execution logic
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;

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
                // Fallback to current diff if no commits
                try {
                    stats = execSync("git diff --stat", { encoding: "utf-8" }).trim();
                    files = execSync("git diff --name-only", {
                        encoding: "utf-8",
                    }).trim();
                } catch {}
            }

            const stack = detectTechStack(cwd);
            const rawData = `Git Commits:\n${commits || "No commits today"}\n\nFull Messages:\n${fullMessages || "N/A"}\n\nFile Changes:\n${stats || "No changes"}\n\nFiles Modified:\n${files || "N/A"}`;

            // Try to call Claude for analysis
            let analysis = "";
            try {
                analysis = await callClaude(
                    "You are a senior developer summarizing today's coding work. Analyze the git data and produce a structured bullet-point summary. IGNORE: formatting, typos, minor refactors. HIGHLIGHT: features added, bugs fixed, architectural/logic changes. Format output as: 🚀 Features: ..., 🐛 Bug Fixes: ..., 🏗 Architecture: ..., 📝 Other: ...",
                    [{ role: "user", content: rawData }]
                );
            } catch (apiError) {
                // Fallback to raw display
                analysis =
                    "API Error (using raw display):\n" +
                    rawData;
            }

            return {
                content: [{ type: "text", text: analysis }],
            };
        }

        if (name === "get_project_summary") {
            const data = getProjectSummaryData();
            const report = `Tech Stack: ${data.stack} (${data.displayName})\n\nFile Tree:\n${data.fileTree}\n\nRecent History:\n${data.recentCommits}`;
            return {
                content: [{ type: "text", text: report }],
            };
        }

        if (name === "get_developer_context") {
            const cwd = process.cwd();
            const stack = detectTechStack(cwd);
            const context = `Tech Stack: ${stack.stack}\nRole: ${stack.displayName}\nPersona: ${stack.persona}`;
            return {
                content: [{ type: "text", text: context }],
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

            console.log("\n📅 Today's Work Report:\n");
            console.log("Analyzing commits...");

            try {
                const analysis = await callClaude(
                    "You are a senior developer summarizing today's coding work. Analyze the git data and produce a structured bullet-point summary. IGNORE: formatting, typos, minor refactors. HIGHLIGHT: features added, bugs fixed, architectural/logic changes. Format output as: 🚀 Features: ..., 🐛 Bug Fixes: ..., 🏗 Architecture: ..., 📝 Other: ...",
                    [{ role: "user", content: rawData }]
                );
                console.log(analysis);
            } catch (apiError) {
                console.log("Raw git data (API unavailable):");
                console.log(rawData);
            }
            console.log("");
        } catch (error) {
            console.error("Error generating day report:", error.message);
            process.exit(1);
        }
    });

program
    .command("summary")
    .description("Get a detailed technical overview of your project")
    .action(() => {
        try {
            const data = getProjectSummaryData();
            console.log("\n📊 Project Summary:\n");
            console.log(`Tech Stack: ${data.stack} (${data.displayName})\n`);
            console.log("File Tree:");
            console.log(data.fileTree);
            console.log("\nRecent History:");
            console.log(data.recentCommits);
            console.log("");
        } catch (error) {
            console.error("Error generating summary:", error.message);
            process.exit(1);
        }
    });

program
    .command("developer [subcommand]")
    .description("Start interactive developer mode (use 'mode' to enter interactive session)")
    .action(async (subcommand) => {
        const cwd = process.cwd();
        const stack = detectTechStack(cwd);

        if (subcommand === "mode") {
            // Interactive mode
            console.log(`\n[SmartCoder] Developer Mode: Acting as ${stack.displayName}\n`);
            console.log(
                `Type your questions or commands. Type '/exit' or leave empty to quit.\n`
            );

            const conversationHistory = [];
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
            });

            const askQuestion = () => {
                rl.question("> ", async (input) => {
                    if (!input || input.toLowerCase() === "/exit") {
                        console.log("\nGoodbye!");
                        rl.close();
                        return;
                    }

                    conversationHistory.push({
                        role: "user",
                        content: input,
                    });

                    try {
                        const response = await callClaude(
                            stack.persona,
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
                            `Error: ${error.message}`
                        );
                        askQuestion();
                    }
                });
            };

            askQuestion();
        } else {
            // Show project context
            console.log(`\n[SmartCoder] Developer Context:\n`);
            console.log(`Tech Stack: ${stack.stack}`);
            console.log(`Role: ${stack.displayName}`);
            console.log(`\nUse 'smartcoder developer mode' to start interactive session.\n`);
        }
    });

/**
 * START THE SERVER
 */
async function main() {
    // If we are being called via a terminal command (like 'summary' or 'dayreport')
    // commander (program.parse) will handle it.
    if (process.argv.length > 2) {
        await program.parse();
        return;
    }

    // If no arguments are passed, assume Claude Code is trying to connect via MCP
    // Set flag so we know we're running with Claude Code premium (no API key needed)
    isMCPMode = true;
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    // Crucial: Only use console.error, never console.log here
    process.stderr.write(`Server error: ${error.message}\n`);
    process.exit(1);
});