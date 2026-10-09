import { Router } from 'express';
import { renderPage, uploadImage, scaleImage, downloadResult } from './image-scaler.controller.js';

const router = Router();

/**
 * Image scaler — intentionally public (no apiKeyAuth/checkOriginAllowed/totpAuth).
 * See src/app.js for the mounting comment.
 */
router.get('/', renderPage);
router.post('/upload', uploadImage);
router.get('/scale/:jobId', scaleImage);
router.get('/download/:jobId', downloadResult);

export default router;
