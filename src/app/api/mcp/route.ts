/**
 * Model Context Protocol (MCP) HTTP endpoint.
 *
 * Implements the JSON-RPC 2.0 surface that any MCP client (Claude Desktop,
 * a restaurant's GPT, third-party agents) can call to take actions on a
 * scoped Apnosh client account.
 *
 * Auth: Authorization: Bearer <apk_...>  -- key from mcp_api_keys table.
 *
 * Methods supported (subset of MCP 2025 spec sufficient for tool use):
 *   - initialize         (capability handshake)
 *   - tools/list         (enumerate available tools)
 *   - tools/call         (invoke a tool with arguments)
 *
 * The endpoint is stateless: every request authenticates and runs.
 * SSE / streaming can be added later.
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateMcp } from '@/lib/mcp/auth'
import { TOOLS, getToolByName, listToolsForClient } from '@/lib/mcp/tools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PROTOCOL_VERSION = '2024-11-05'  // current MCP spec version we target

// ─── JSON-RPC helpers ──────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

function rpcResult(id: JsonRpcRequest['id'], result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, result })
}

function rpcError(id: JsonRpcRequest['id'], code: number, message: string, status = 200) {
  return NextResponse.json(
    { jsonrpc: '2.0', id: id ?? null, error: { code, message } },
    { status },
  )
}

// ─── POST handler ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Auth
  const auth = await authenticateMcp(req.headers.get('authorization'))
  if (!auth.ok) {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32000, message: auth.error } },
      { status: 401 },
    )
  }

  // 2. Parse JSON-RPC request
  let body: JsonRpcRequest
  try {
    body = await req.json()
  } catch {
    return rpcError(null, -32700, 'Parse error', 400)
  }
  if (body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    return rpcError(body?.id ?? null, -32600, 'Invalid Request', 400)
  }

  // 3. Method dispatch
  switch (body.method) {
    case 'initialize':
      return rpcResult(body.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: {
          name: 'apnosh-mcp',
          version: '0.1.0',
        },
      })

    case 'tools/list':
      return rpcResult(body.id, { tools: listToolsForClient() })

    case 'tools/call': {
      const { name, arguments: args } = (body.params ?? {}) as {
        name?: string
        arguments?: unknown
      }
      if (!name) return rpcError(body.id, -32602, 'Missing tool name')
      const tool = getToolByName(name)
      if (!tool) return rpcError(body.id, -32601, `Tool not found: ${name}`)
      try {
        const result = await tool.handler(args ?? {}, auth.principal)
        return rpcResult(body.id, result)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Tool execution failed'
        return rpcError(body.id, -32000, msg)
      }
    }

    case 'ping':
      return rpcResult(body.id, {})

    default:
      return rpcError(body.id, -32601, `Method not found: ${body.method}`)
  }
}

// ─── GET handler (basic discovery) ─────────────────────────────────

export async function GET() {
  return NextResponse.json({
    name: 'apnosh-mcp',
    description: 'Model Context Protocol server for Apnosh restaurant marketing operations.',
    transport: 'http',
    protocolVersion: PROTOCOL_VERSION,
    auth: 'Authorization: Bearer <mcp_api_key>',
    methods: ['initialize', 'tools/list', 'tools/call', 'ping'],
    toolCount: TOOLS.length,
  })
}
