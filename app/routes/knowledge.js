import { Router } from 'express';
import multer from 'multer';
import { ensureAuth } from '../middleware/auth.js';
import {
  index,
  newForm,
  create,
  show,
  editForm,
  update,
  destroy,
  uploadKnowledgeImage
} from '../controllers/knowledgeController.js';

const router = Router({ mergeParams: true });

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024
  }
});

router.get('/', ensureAuth, index);
router.get('/new', ensureAuth, newForm);
router.post('/uploads/image', ensureAuth, imageUpload.single('image'), uploadKnowledgeImage);
router.post('/', ensureAuth, create);
router.get('/:knowledgeId', ensureAuth, show);
router.get('/:knowledgeId/edit', ensureAuth, editForm);
router.put('/:knowledgeId', ensureAuth, update);
router.delete('/:knowledgeId', ensureAuth, destroy);

export default router;
