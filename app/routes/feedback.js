import { Router } from 'express';

import { ensureAuth } from '../middleware/auth.js';
import { confirmation, index, submissions, toggleEnabled, update } from '../controllers/feedbackController.js';

const router = Router({ mergeParams: true });

router.get('/', ensureAuth, index);
router.post('/', ensureAuth, update);
router.post('/toggle-enabled', ensureAuth, toggleEnabled);
router.get('/submissions', ensureAuth, submissions);
router.get('/confirmation', ensureAuth, confirmation);

export default router;
