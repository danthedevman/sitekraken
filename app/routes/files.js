import { Router } from 'express';
import { ensureAuth } from '../middleware/auth.js';
import { index, create, destroy, upload } from '../controllers/fileController.js';

const router = Router({ mergeParams: true });

router.get('/', ensureAuth, index);
router.post('/', ensureAuth, upload.single('file'), create);
router.delete('/:fileId', ensureAuth, destroy);

export default router;
