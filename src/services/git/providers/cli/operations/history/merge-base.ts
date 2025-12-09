/**
 * @fileoverview CLI provider git merge-base operation
 * @module services/git/providers/cli/operations/history/merge-base
 */

import { JsonRpcErrorCode, McpError } from '@/types-global/errors.js';
import type { RequestContext } from '@/utils/index.js';

import type {
  GitOperationContext,
  GitMergeBaseOptions,
  GitMergeBaseResult,
} from '../../../../types.js';
import { buildGitCommand, mapGitError } from '../../utils/index.js';

/**
 * Execute git merge-base to find common ancestor(s) between refs.
 *
 * @param options - Merge-base options
 * @param context - Operation context
 * @param execGit - Function to execute git commands
 * @returns Merge-base result
 */
export async function executeMergeBase(
  options: GitMergeBaseOptions,
  context: GitOperationContext,
  execGit: (
    args: string[],
    cwd: string,
    ctx: RequestContext,
  ) => Promise<{ stdout: string; stderr: string }>,
): Promise<GitMergeBaseResult> {
  try {
    const mode = options.mode || 'default';

    // Validate refs count based on mode
    if (mode === 'is-ancestor' && options.refs.length !== 2) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        'is-ancestor mode requires exactly 2 refs',
      );
    }

    if (options.refs.length < 1) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        'At least 1 ref required for merge-base',
      );
    }

    // Build command based on mode
    const args: string[] = [];

    switch (mode) {
      case 'all':
        args.push('--all');
        break;
      case 'is-ancestor':
        args.push('--is-ancestor');
        break;
      case 'default':
      default:
        // No special flags for default mode
        break;
    }

    // Add refs to command
    args.push(...options.refs);

    const cmd = buildGitCommand({ command: 'merge-base', args });

    try {
      const gitOutput = await execGit(
        cmd,
        context.workingDirectory,
        context.requestContext,
      );

      // For is-ancestor mode, successful execution means it IS an ancestor
      if (mode === 'is-ancestor') {
        return {
          success: true,
          mergeBase: null,
          isAncestor: true,
          refs: options.refs,
          mode,
        };
      }

      // Parse output for default and all modes
      const output = gitOutput.stdout.trim();

      if (!output) {
        // No merge-base found (can happen with unrelated histories)
        return {
          success: true,
          mergeBase: null,
          refs: options.refs,
          mode,
        };
      }

      // Split by newlines for multiple results (--all mode)
      const hashes = output
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      // Return based on mode
      if (mode === 'all') {
        return {
          success: true,
          mergeBase: hashes,
          refs: options.refs,
          mode,
        };
      }

      // Default mode: single hash
      return {
        success: true,
        mergeBase: hashes[0] || null,
        refs: options.refs,
        mode,
      };
    } catch (error: unknown) {
      // Special handling for is-ancestor mode exit code 1 (not an error, just false)
      if (
        mode === 'is-ancestor' &&
        error instanceof Error &&
        'code' in error &&
        error.code === 1
      ) {
        return {
          success: true,
          mergeBase: null,
          isAncestor: false,
          refs: options.refs,
          mode,
        };
      }

      // All other errors are real errors
      throw error;
    }
  } catch (error) {
    throw mapGitError(error, 'merge-base');
  }
}

