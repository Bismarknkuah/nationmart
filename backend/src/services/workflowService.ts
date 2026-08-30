import { workflows } from '../repos/platformRepo';

/** Raise a task for an officer. Never throws — a workflow must not break a sale. */
export async function raiseWorkflow(input: {
  title: string; assignedRole?: string; assignedTo?: string;
  region?: string; district?: string; priority?: number; payload?: any;
}): Promise<void> {
  try { await workflows.start(input); }
  catch (err: any) { console.error('[workflow] could not raise task:', err?.message); }
}

export { workflows };
export default raiseWorkflow;
