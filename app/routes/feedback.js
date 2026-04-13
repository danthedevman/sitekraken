import { Router } from 'express';

import { ensureAuth } from '../middleware/auth.js';
import {
  index,
  update,
  submissions,
  confirmForm,
  updateConfirm
} from '../controllers/feedbackController.js';

const router = Router({ mergeParams: true });

router.get('/', ensureAuth, index);
router.post('/', ensureAuth, update);
router.get('/submissions', ensureAuth, submissions);
router.get('/confirm', ensureAuth, confirmForm);
router.post('/confirm', ensureAuth, updateConfirm);

export default router;
