import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { workflows } from '../repos/platformRepo';
import { scopeFor } from '../repos/managementRepo';

export const listDefinitions = async (_req: AuthRequest, res: Response): Promise<void> => {
  try { res.json({ definitions: await workflows.listDefinitions() }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const defineWorkflow = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!/admin|ceo|coo/i.test(req.user.role)) { res.status(403).json({ error: 'Not authorized.' }); return; }
    res.json({ definition: await workflows.defineWorkflow(req.body) });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

export const startWorkflow = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = scopeFor(req.user);
    const instance = await workflows.start({
      ...req.body,
      region: req.body.region ?? scope.region,
      district: req.body.district ?? scope.district,
    });
    res.status(201).json({ instance });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

export const myWorkflows = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = scopeFor(req.user);
    res.json({ workflows: await workflows.mine(req.user.id, scope) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const advanceWorkflow = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const updated = await workflows.advance(req.params.id, req.body.state, req.user.id);
    if (!updated) { res.status(404).json({ error: 'Workflow not found.' }); return; }
    res.json({ instance: updated });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

export const overdueWorkflows = async (_req: AuthRequest, res: Response): Promise<void> => {
  try { res.json({ overdue: await workflows.overdue() }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
};

// ─── Extras ──────────────────────────────────────────────────────────────────
import { q } from '../db/pg';

export const listInstances = myWorkflows;
export const startInstance = startWorkflow;

export const getInstance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [row] = await q<any>(
      `SELECT w.*, d.name AS definition_name, d.steps, u.full_name AS assignee
         FROM workflow_instances w
         LEFT JOIN workflow_definitions d ON d.id = w.definition_id
         LEFT JOIN users u ON u.id = w.assigned_to
        WHERE w.id = $1::uuid`,
      [req.params.id],
    );
    if (!row) { res.status(404).json({ error: 'Workflow not found.' }); return; }
    res.json({ instance: row });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** Install the standard workflow templates. Safe to re-run. */
export const seedWorkflowDefinitions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!/admin|ceo|coo/i.test(req.user.role)) { res.status(403).json({ error: 'Not authorized.' }); return; }
    const templates = [
      { key: 'rider_approval', name: 'Rider approval',
        description: 'Verify a new rider and let them start taking jobs.',
        steps: ['Check Ghana Card', 'Check vehicle licence', 'Approve or decline'] },
      { key: 'seller_onboarding', name: 'Seller onboarding',
        description: 'Get a new seller trading.',
        steps: ['Verify identity', 'Set up store', 'Add first listings', 'Set up payouts'] },
      { key: 'fraud_investigation', name: 'Fraud investigation',
        description: 'Look into a report against a user.',
        steps: ['Review the report', 'Gather evidence', 'Decide', 'Notify the parties'] },
      { key: 'failed_delivery', name: 'Failed delivery follow-up',
        description: 'Put right a delivery that did not arrive.',
        steps: ['Contact the buyer', 'Contact the rider', 'Re-deliver or refund'] },
    ];
    const made = [];
    for (const t of templates) made.push(await workflows.defineWorkflow(t));
    res.json({ installed: made.length, definitions: made });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

export const myInbox = myWorkflows;
export const decide = advanceWorkflow;
