#!/usr/bin/env node
/**
 * Stdio-to-SSE bridge for the ArduDeck test driver MCP server.
 *
 * Claude Code spawns this as a child process (stdio transport).
 * It reads the discovery file from /tmp/ardudeck-mcp.json to find the
 * dynamic SSE port, then proxies MCP messages between stdio and SSE.
 *
 * If ArduDeck isn't running, exits with an error message.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DISCOVERY_PATH = join(homedir(), '.ardudeck', 'mcp.json');

let discovery;
try {
  discovery = JSON.parse(readFileSync(DISCOVERY_PATH, 'utf-8'));
} catch {
  process.stderr.write('[ardudeck-mcp-bridge] ArduDeck is not running in dev mode (no discovery file)\n');
  process.exit(1);
}

const sseUrl = discovery.sseUrl;
const messagesUrl = discovery.messagesUrl;

if (!sseUrl) {
  process.stderr.write('[ardudeck-mcp-bridge] Invalid discovery file — no sseUrl\n');
  process.exit(1);
}

// Connect to SSE endpoint
let sessionUrl = null;

async function connectSSE() {
  const response = await fetch(sseUrl, {
    headers: { 'Accept': 'text/event-stream' },
  });

  if (!response.ok) {
    process.stderr.write(`[ardudeck-mcp-bridge] SSE connection failed: ${response.status}\n`);
    process.exit(1);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let eventType = null;
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (eventType === 'endpoint') {
          // First message: the endpoint URL with session ID
          sessionUrl = new URL(data, discovery.url).href;
          process.stderr.write(`[ardudeck-mcp-bridge] Connected, session: ${sessionUrl}\n`);
        } else if (eventType === 'message') {
          // MCP response from server — write to stdout
          process.stdout.write(data + '\n');
        }
        eventType = null;
      }
    }
  }
}

// Read stdin for MCP requests, forward to HTTP endpoint
async function readStdin() {
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of process.stdin) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      // Wait for session URL
      while (!sessionUrl) {
        await new Promise(r => setTimeout(r, 50));
      }

      // Forward to MCP server via POST
      try {
        const resp = await fetch(sessionUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: line,
        });
        if (!resp.ok) {
          process.stderr.write(`[ardudeck-mcp-bridge] POST failed: ${resp.status} ${await resp.text()}\n`);
        }
      } catch (err) {
        process.stderr.write(`[ardudeck-mcp-bridge] POST error: ${err.message}\n`);
      }
    }
  }
}

connectSSE().catch(err => {
  process.stderr.write(`[ardudeck-mcp-bridge] SSE error: ${err.message}\n`);
  process.exit(1);
});

readStdin().catch(err => {
  process.stderr.write(`[ardudeck-mcp-bridge] stdin error: ${err.message}\n`);
  process.exit(1);
});
