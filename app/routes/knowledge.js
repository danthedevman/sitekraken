import { Router } from 'express';
import { ensureAuth } from '../middleware/auth.js';
import {
  index,
  newForm,
  create,
  show,
  editForm,
  update,
  destroy
} from '../controllers/knowledgeController.js';

const router = Router({ mergeParams: true });

router.get('/', ensureAuth, index);
router.get('/new', ensureAuth, newForm);
router.post('/', ensureAuth, create);
router.get('/:knowledgeId', ensureAuth, show);
router.get('/:knowledgeId/edit', ensureAuth, editForm);
router.put('/:knowledgeId', ensureAuth, update);
router.delete('/:knowledgeId', ensureAuth, destroy);

export default router;