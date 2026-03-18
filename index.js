#!/usr/bin/env node

import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import Anthropic from "@anthropic-ai/sdk";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * CORE LOGIC (REUSED FROM YOUR ORIGINAL)
 */

const getConfig = () => {
    const configPath = path.join(os.homedir(), ".smartcoder", "config.json");
    if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
    return {};
};

const getProjectSummaryData = () => {
    const cwd = process.cwd();
    const files = fs.readdirSync(cwd);

    // Project type detection
    let projectType = "Unknown";
    if (files.includes("package.json")) projectType = "JS/Node";
    else if (files.includes("pubspec.yaml")) projectType = "Flutter";
    // ... (Your other detection logic)

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

    return { projectType, fileTree, recentCommits };
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
                description: "Generates a summary of today's git commits and code changes.",
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "get_project_summary",
                description: "Analyzes the project structure, tech stack, and file tree for a deep summary.",
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
            const commits = execSync('git log --since="today" --oneline', { encoding: "utf-8" }).trim();
            const diff = execSync("git diff --stat", { encoding: "utf-8" }).trim();
            return {
                content: [{ type: "text", text: `Today's Activity:\nCommits: ${commits}\nChanges: ${diff}` }],
            };
        }

        if (name === "get_project_summary") {
            const data = getProjectSummaryData();
            const report = `Project Type: ${data.projectType}\n\nFile Tree:\n${data.fileTree}\n\nRecent History:\n${data.recentCommits}`;
            return {
                content: [{ type: "text", text: report }],
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
 * START THE SERVER
 */
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // Note: Do not console.log here, as it will break the MCP protocol (which uses stdout)
}

main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});