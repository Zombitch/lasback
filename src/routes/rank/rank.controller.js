import { Rank } from './rank.model.js';

const MAX_ENTRIES = 200;
const MAX_ADDITIONAL_LABELS = 20;

/**
 * Parse the `additionalLabels` query param into a deduped, bounded list.
 * Accepts a comma-separated string ("Clones,Floor") or repeated query keys
 * (Express turns `?additionalLabels=a&additionalLabels=b` into an array).
 */
function parseAdditionalLabels(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : String(raw).split(',');
  const cleaned = list.map((l) => l?.toString().trim()).filter(Boolean);
  return [...new Set(cleaned)].slice(0, MAX_ADDITIONAL_LABELS);
}

/**
 * POST /rank
 *
 * Record a ranking submission: a set of labelled values for a user.
 * `values` and `labels` are parallel arrays and must have the same size.
 *
 * Body params (all optional except values/labels):
 *   source, version, userId, values (Array<number>), labels (Array<string>)
 */
export async function postRank(req, res) {
  const { source, version, userId, values, labels } = req.body ?? {};

  if (!Array.isArray(values) || !Array.isArray(labels)) {
    return res
      .status(400)
      .json({ success: false, message: '`values` and `labels` must be arrays' });
  }

  if (values.length !== labels.length) {
    return res
      .status(400)
      .json({ success: false, message: '`values` and `labels` must have the same size' });
  }

  if (values.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: '`values` and `labels` must not be empty' });
  }

  if (values.length > MAX_ENTRIES) {
    return res
      .status(400)
      .json({ success: false, message: `\`values\` and \`labels\` must not exceed ${MAX_ENTRIES} entries` });
  }

  const numericValues = values.map(Number);
  if (numericValues.some((v) => typeof v !== 'number' || Number.isNaN(v))) {
    return res.status(400).json({ success: false, message: 'Every entry in `values` must be a number' });
  }

  const stringLabels = labels.map((label) => label?.toString().trim().slice(0, 100));
  if (stringLabels.some((label) => !label)) {
    return res
      .status(400)
      .json({ success: false, message: 'Every entry in `labels` must be a non-empty string' });
  }

  const rankSource = source?.toString().trim().slice(0, 100);
  const rankUserId = userId?.toString().trim().slice(0, 200);

  // Only the latest submission per userId/source combo is kept.
  await Rank.deleteMany({ source: rankSource, userId: rankUserId });

  const rank = await Rank.create({
    source: rankSource,
    version: version?.toString().trim().slice(0, 50),
    userId: rankUserId,
    values: numericValues,
    labels: stringLabels,
  });

  return res.status(201).json({
    success: true,
    id: rank._id,
    timestamp: rank.createdAt,
  });
}

/**
 * GET /rank
 *
 * Look up a userId's rank among all submissions carrying the given label,
 * sorted by that label's value (highest first), along with the 5 entries
 * ranked immediately above and the 5 ranked immediately below.
 *
 * Query params: userId, label, source (all required — ranking is always
 * scoped to a single source, otherwise values from unrelated games/sites
 * would be compared against each other)
 *   additionalLabels (optional) — comma-separated label names (e.g.
 *   "Clones,Floor"); when set, each returned entry (the target user plus
 *   the before/after neighbors) also carries an `additionalValues` object
 *   with that user's value for each of those labels, if they have one.
 */
export async function getRank(req, res, next) {
  try {
    const { userId, label, source } = req.query;
    const additionalLabels = parseAdditionalLabels(req.query.additionalLabels);

    if (!userId || !label || !source) {
      return res
        .status(400)
        .json({ success: false, message: '`userId`, `label`, and `source` are required query params' });
    }

    const entries = await Rank.aggregate([
      { $match: { source } },
      { $addFields: { __idx: { $indexOfArray: ['$labels', label] } } },
      { $match: { __idx: { $ne: -1 } } },
      { $addFields: { __value: { $arrayElemAt: ['$values', '$__idx'] } } },
      { $sort: { __value: -1 } },
      { $project: { _id: 0, userId: 1, value: '$__value' } },
    ]);

    const targetIndex = entries.findIndex((e) => e.userId === userId);

    if (targetIndex === -1) {
      return res
        .status(404)
        .json({ success: false, message: 'No submission found for this userId and label' });
    }

    const before = entries.slice(Math.max(0, targetIndex - 5), targetIndex);
    const after = entries.slice(targetIndex + 1, targetIndex + 6);

    let additionalValuesByUser = null;
    if (additionalLabels.length) {
      const windowUserIds = [...new Set([userId, ...before.map((e) => e.userId), ...after.map((e) => e.userId)])];

      const docs = await Rank.find(
        { source, userId: { $in: windowUserIds } },
        { userId: 1, labels: 1, values: 1, _id: 0 },
      ).lean();

      additionalValuesByUser = new Map();
      for (const doc of docs) {
        const vals = {};
        for (const lbl of additionalLabels) {
          const idx = doc.labels.indexOf(lbl);
          if (idx !== -1) vals[lbl] = doc.values[idx];
        }
        additionalValuesByUser.set(doc.userId, vals);
      }
    }

    const withAdditional = (entry) =>
      additionalValuesByUser
        ? { ...entry, additionalValues: additionalValuesByUser.get(entry.userId) || {} }
        : entry;

    return res.json({
      success: true,
      userId,
      label,
      source,
      rank: targetIndex + 1,
      total: entries.length,
      value: entries[targetIndex].value,
      ...(additionalValuesByUser ? { additionalValues: additionalValuesByUser.get(userId) || {} } : {}),
      before: before.map(withAdditional),
      after: after.map(withAdditional),
    });
  } catch (err) {
    next(err);
  }
}
