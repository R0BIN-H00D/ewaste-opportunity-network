'use strict';
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { documentUpload } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimit');
const v = require('../validators/verification.validators');
const ctrl = require('../controllers/verification.controller');

router.use(authenticate);

router.get('/status', ctrl.status);
// multer must run before validate(): it is what fills req.body for multipart requests.
router.post('/documents', uploadLimiter, ...documentUpload('documents', 3), validate({ body: v.submitBody }), ctrl.submit);
router.delete('/documents/:id', validate({ params: v.docParam }), ctrl.remove);

module.exports = router;
