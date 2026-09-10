import { z } from 'zod';
import type { Project } from '../domain/model';
import { qualityGate } from '../domain/quality';
type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
type ModelDocument = Document & {
  modelContext?: {
    registerTool: (tool: Tool, options: { signal: AbortSignal }) => void | Promise<void>;
  };
};
export function registerSpecTool(project: Project) {
  const context = (document as ModelDocument).modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  const tool: Tool = {
    name: 'get_current_specification',
    description:
      'Read the currently open SpecFlow draft, its source segments, and completeness metrics. Does not approve or modify requirements.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute(input) {
      z.object({}).strict().parse(input);
      return { project, quality: qualityGate(project), notice: 'Draft requires human review.' };
    },
  };
  try {
    void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {
      /* Optional browser capability; the normal UI remains available. */
    });
  } catch {
    /* Unsupported implementation does not block the workspace. */
  }
  return () => lifecycle.abort();
}
