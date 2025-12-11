/**
 * @fileoverview Git merge-base tool - find common ancestors between refs
 * @module mcp-server/tools/definitions/git-merge-base
 */
import { z } from 'zod';

import type { ToolDefinition } from '../utils/toolDefinition.js';
import { withToolAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { PathSchema, CommitRefSchema } from '../schemas/common.js';
import {
  createToolHandler,
  type ToolLogicDependencies,
} from '../utils/toolHandlerFactory.js';
import {
  createJsonFormatter,
  type VerbosityLevel,
} from '../utils/json-response-formatter.js';

const TOOL_NAME = 'git_merge_base';
const TOOL_TITLE = 'Git Merge-Base';
const TOOL_DESCRIPTION =
  'Find the best common ancestor(s) between commits, branches, or tags. Useful for determining merge bases, checking ancestry relationships, and understanding branch divergence.';

const TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
};

const InputSchema = z.object({
  path: PathSchema,
  refs: z
    .array(CommitRefSchema)
    .min(1)
    .describe(
      'Array of refs (commits, branches, tags) to find common ancestor. Most modes require 2+ refs. Examples: ["HEAD", "origin/main"], ["feature-branch", "develop"]',
    ),
  mode: z
    .enum(['default', 'all', 'is-ancestor'])
    .default('default')
    .describe(
      'Mode: "default" (single best common ancestor), "all" (all common ancestors), "is-ancestor" (check if first ref is ancestor of second, requires exactly 2 refs)',
    ),
});

const OutputSchema = z.object({
  success: z.boolean().describe('Indicates if the operation was successful.'),
  mergeBase: z
    .union([z.string(), z.array(z.string()), z.null()])
    .describe(
      'Common ancestor commit hash. Single string for default mode, array for all mode, null if no merge-base found.',
    ),
  isAncestor: z
    .boolean()
    .optional()
    .describe(
      'For is-ancestor mode only: whether the first ref is an ancestor of the second ref.',
    ),
  refs: z.array(z.string()).describe('The refs that were compared.'),
  mode: z.string().describe('Mode used for the operation.'),
});

type ToolInput = z.infer<typeof InputSchema>;
type ToolOutput = z.infer<typeof OutputSchema>;
type ToolAnnotations = Record<string, unknown>;

async function gitMergeBaseLogic(
  input: ToolInput,
  { provider, targetPath, appContext }: ToolLogicDependencies,
): Promise<ToolOutput> {
  // Build options object
  const mergeBaseOptions: {
    refs: string[];
    mode?: 'default' | 'all' | 'is-ancestor';
  } = {
    refs: input.refs,
  };

  if (input.mode !== 'default') {
    mergeBaseOptions.mode = input.mode;
  }

  const result = await provider.mergeBase(mergeBaseOptions, {
    workingDirectory: targetPath,
    requestContext: appContext,
    tenantId: appContext.tenantId || 'default-tenant',
  });

  return {
    success: result.success,
    mergeBase: result.mergeBase,
    isAncestor: result.isAncestor,
    refs: result.refs,
    mode: result.mode,
  };
}

/**
 * Filter git_merge_base output based on verbosity level.
 *
 * Verbosity levels:
 * - minimal: Success status and isAncestor (for ancestry checks)
 * - standard: Above + mergeBase hash(es) and refs (RECOMMENDED)
 * - full: Complete output
 */
function filterGitMergeBaseOutput(
  result: ToolOutput,
  level: VerbosityLevel,
): Partial<ToolOutput> {
  // minimal: Essential info only
  if (level === 'minimal') {
    return {
      success: result.success,
      isAncestor: result.isAncestor,
    };
  }

  // standard & full: Complete output
  // (LLMs need complete context - include all data)
  return result;
}

// Create JSON response formatter with verbosity filtering
const responseFormatter = createJsonFormatter<ToolOutput>({
  filter: filterGitMergeBaseOutput,
});

export const gitMergeBaseTool: ToolDefinition<
  typeof InputSchema,
  typeof OutputSchema
> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: TOOL_ANNOTATIONS,
  logic: withToolAuth(['tool:git:read'], createToolHandler(gitMergeBaseLogic)),
  responseFormatter,
};

