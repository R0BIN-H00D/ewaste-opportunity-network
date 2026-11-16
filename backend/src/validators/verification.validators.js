'use strict';
const { z, objectId } = require('./common');
const { DOC_TYPES } = require('../config/constants');

// multipart: the files come from multer, the one text field is validated here.
const submitBody = z.object({ docType: z.enum(DOC_TYPES) }).strict();
const docParam = z.object({ id: objectId }).strict();

module.exports = { submitBody, docParam };
