import { Router } from 'express';
import { ensureAuth } from '../middleware/auth.js';
import { index, newForm, create, show } from '../controllers/workspaceController.js';

const router = Router();

router.get('/', ensureAuth, index);
router.get('/new', ensureAuth, newForm);
router.post('/', ensureAuth, create);
router.get('/:id', ensureAuth, show);

export default router;
