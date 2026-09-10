import { it, expect, vi } from 'vitest';
import { createDemo } from '../src/data/demo';
import { registerSpecTool } from '../src/services/webmcp';
it('registers a read-only current-document tool and validates input', () => {
  const registerTool = vi.fn();
  Object.defineProperty(document, 'modelContext', { value: { registerTool }, configurable: true });
  try {
    const project = createDemo();
    const cleanup = registerSpecTool(project);
    const [tool, options] = registerTool.mock.calls[0];
    expect(tool.name).toBe('get_current_specification');
    expect(tool.annotations.readOnlyHint).toBe(true);
    expect(tool.execute({}).project).toEqual(project);
    expect(() => tool.execute({ approve: true })).toThrow();
    cleanup?.();
    expect(options.signal.aborted).toBe(true);
  } finally {
    Object.defineProperty(document, 'modelContext', { value: undefined, configurable: true });
  }
});
