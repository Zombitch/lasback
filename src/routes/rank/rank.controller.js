import { Rank } from './rank.model.js';

const MAX_ENTRIES = 200;

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
 * Query params: userId, label (both required)
 */
export async function getRank(req, res, next) {
  try {
    const { userId, label } = req.query;

    if (!userId || !label) {
      return res
        .status(400)
        .json({ success: false, message: '`userId` and `label` are required query params' });
    }

    const entries = await Rank.aggregate([
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

    return res.json({
      success: true,
      userId,
      label,
      rank: targetIndex + 1,
      total: entries.length,
      value: entries[targetIndex].value,
      before: entries.slice(Math.max(0, targetIndex - 5), targetIndex),
      after: entries.slice(targetIndex + 1, targetIndex + 6),
    });
  } catch (err) {
    next(err);
  }
}
