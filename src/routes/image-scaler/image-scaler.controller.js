import crypto from 'crypto';
import multer from 'multer';
import sharp from 'sharp';

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_DIMENSION = 4096 * 5; // 20480px, per side, applies to the uploaded image
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const ROWS_PER_CHUNK = 64; // pixel rows processed between progress events
const JOB_TTL_MS = 5 * 60 * 1000; // abandoned jobs are swept after 5 min

/**
 * In-memory job store.
 *
 * Single-instance only — if this app ever runs multiple replicas, jobs
 * created on one instance won't be visible on another. Fine for now since
 * nothing else in this app is horizontally scaled either.
 */
const jobs = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
  }
}, 60 * 1000).unref();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Unsupported image type. Use PNG, JPEG, or WebP.'));
    }
    cb(null, true);
  },
});

export function renderPage(req, res) {
  res.render('image-scaler', {
    maxFileSizeMb: MAX_FILE_SIZE_BYTES / (1024 * 1024),
    maxDimension: MAX_DIMENSION,
  });
}

/**
 * POST /image-scaler/upload
 *
 * Accepts a single image file, decodes it to a raw RGBA pixel buffer, and
 * stashes it in the job store. Returns a jobId used to kick off scaling via
 * the SSE endpoint below.
 */
export function uploadImage(req, res) {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `Image exceeds the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit`
          : err.message || 'Upload failed';
      return res.status(400).json({ success: false, message });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: '`image` file is required' });
    }

    let metadata;
    try {
      metadata = await sharp(req.file.buffer, {
        limitInputPixels: MAX_DIMENSION * MAX_DIMENSION,
      }).metadata();
    } catch {
      return res.status(400).json({ success: false, message: 'Could not read uploaded image' });
    }

    if (!metadata.width || !metadata.height) {
      return res.status(400).json({ success: false, message: 'Could not read image dimensions' });
    }

    if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
      return res.status(400).json({
        success: false,
        message: `Image dimensions must not exceed ${MAX_DIMENSION}x${MAX_DIMENSION}px (got ${metadata.width}x${metadata.height})`,
      });
    }

    const { data, info } = await sharp(req.file.buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const jobId = crypto.randomUUID();
    jobs.set(jobId, {
      srcBuffer: data,
      width: info.width,
      height: info.height,
      channels: info.channels,
      createdAt: Date.now(),
    });

    return res.status(200).json({
      success: true,
      jobId,
      width: info.width,
      height: info.height,
    });
  });
}

/**
 * Duplicates every pixel of `src` into a 2x2 block of `dst` (same color),
 * for rows [startRow, endRow). This is the literal "one pixel becomes four"
 * scale — nearest-neighbor duplication, not interpolation.
 */
function scaleRows(src, dst, srcWidth, dstWidth, channels, startRow, endRow) {
  for (let y = startRow; y < endRow; y++) {
    const srcRowOffset = y * srcWidth * channels;
    const dstRow0Offset = y * 2 * dstWidth * channels;
    const dstRow1Offset = (y * 2 + 1) * dstWidth * channels;

    for (let x = 0; x < srcWidth; x++) {
      const srcPixelOffset = srcRowOffset + x * channels;
      const dstX0 = x * 2 * channels;
      const dstX1 = dstX0 + channels;

      for (let c = 0; c < channels; c++) {
        const value = src[srcPixelOffset + c];
        dst[dstRow0Offset + dstX0 + c] = value;
        dst[dstRow0Offset + dstX1 + c] = value;
        dst[dstRow1Offset + dstX0 + c] = value;
        dst[dstRow1Offset + dstX1 + c] = value;
      }
    }
  }
}

/**
 * GET /image-scaler/scale/:jobId (Server-Sent Events)
 *
 * Streams real progress as the pixel buffer is processed in row chunks,
 * then emits a `done` event once the result has been re-encoded to PNG.
 */
export async function scaleImage(req, res) {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ success: false, message: 'Unknown or expired job' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let aborted = false;
  req.on('close', () => {
    aborted = true;
  });

  const { srcBuffer, width, height, channels } = job;
  const dstWidth = width * 2;
  const dstHeight = height * 2;
  const dstBuffer = Buffer.alloc(dstWidth * dstHeight * channels);

  try {
    for (let startRow = 0; startRow < height; startRow += ROWS_PER_CHUNK) {
      if (aborted) break;

      const endRow = Math.min(startRow + ROWS_PER_CHUNK, height);
      scaleRows(srcBuffer, dstBuffer, width, dstWidth, channels, startRow, endRow);

      sendEvent('progress', { percent: Math.round((endRow / height) * 100) });

      // Yield to the event loop so progress events actually flush and the
      // server stays responsive to other requests between chunks.
      await new Promise((resolve) => setImmediate(resolve));
    }

    if (aborted) {
      jobs.delete(jobId);
      return;
    }

    const resultBuffer = await sharp(dstBuffer, {
      raw: { width: dstWidth, height: dstHeight, channels },
    })
      .png()
      .toBuffer();

    job.srcBuffer = null; // free the (now unneeded) source pixels
    job.resultBuffer = resultBuffer;
    job.width = dstWidth;
    job.height = dstHeight;

    sendEvent('done', { jobId, width: dstWidth, height: dstHeight });
    res.end();
  } catch {
    sendEvent('error', { message: 'Scaling failed' });
    res.end();
    jobs.delete(jobId);
  }
}

/**
 * GET /image-scaler/download/:jobId
 *
 * Serves the scaled PNG. `?download=1` forces a file download instead of
 * inline display (used for the <img> preview vs. the download link).
 */
export function downloadResult(req, res) {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job || !job.resultBuffer) {
    return res.status(404).json({ success: false, message: 'Unknown or expired job' });
  }

  if (req.query.download === '1') {
    res.setHeader('Content-Disposition', `attachment; filename="scaled-${jobId}.png"`);
  }
  res.setHeader('Content-Type', 'image/png');
  res.send(job.resultBuffer);
}
