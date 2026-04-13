import { Router } from 'express';

import { ensureAuth } from '../middleware/auth.js';
import { index, record, update } from '../controllers/announcementsController.js';

const router = Router({ mergeParams: true });

router.get('/', ensureAuth, index);
router.get('/new', ensureAuth, record);
router.get('/:bannerId/edit', ensureAuth, record);
router.post('/', ensureAuth, update);

export default router;
