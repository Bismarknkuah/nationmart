import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { levelOf } from '../services/roleAuthority';
import { list, create, update, changeRole, setStatus, resetPassword } from '../controllers/userMgmtController';

const router = Router();
router.use(authenticate);

/**
 * Only staff at level 4 (district admin) or higher may reach user management at
 * all. The per-action guardrail in the repo then restricts WHICH users each
 * actor can touch. Two layers: the door, and the guardrail beyond it.
 */
function requireManager(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || levelOf(req.user.role) > 4) {
    res.status(403).json({ error: 'User management is for administrators only.' });
    return;
  }
  next();
}
router.use(requireManager as any);

router.get('/', list as any);
router.post('/', create as any);
router.patch('/:id', update as any);
router.patch('/:id/role', changeRole as any);
router.patch('/:id/status', setStatus as any);
router.post('/:id/reset-password', resetPassword as any);

export default router;
