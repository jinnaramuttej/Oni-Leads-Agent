import { Router, type Request, type Response, type IRouter } from 'express';
import { leadsService } from '../services/leads.service';
import type { ApiResponse } from '@leads/shared';
import type { Lead } from '@leads/shared';

export const leadsRouter: IRouter = Router();

// GET /api/leads  — list all leads (paginated)
leadsRouter.get('/', async (req: Request, res: Response) => {
  const page = parseInt(String(req.query.page ?? '1'), 10);
  const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10), 200);

  const result = await leadsService.list({ page, limit });

  const response: ApiResponse<typeof result> = { success: true, data: result };
  res.json(response);
});

// GET /api/leads/:id
leadsRouter.get('/:id', async (req: Request, res: Response) => {
  const lead = await leadsService.getById(req.params.id);
  if (!lead) {
    const response: ApiResponse<null> = {
      success: false,
      error: 'Lead not found',
      code: 'NOT_FOUND',
    };
    return res.status(404).json(response);
  }
  const response: ApiResponse<Lead> = { success: true, data: lead };
  res.json(response);
});

// PATCH /api/leads/:id
leadsRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const updated = await leadsService.update(req.params.id, req.body);
    const response: ApiResponse<Lead> = { success: true, data: updated };
    res.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Update failed';
    const response: ApiResponse<null> = { success: false, error: message };
    res.status(400).json(response);
  }
});
