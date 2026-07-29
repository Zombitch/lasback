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

  const rank = await Rank.create({
    source: source?.toString().trim().slice(0, 100),
    version: version?.toString().trim().slice(0, 50),
    userId: userId?.toString().trim().slice(0, 200),
    values: numericValues,
    labels: stringLabels,
  });

  return res.status(201).json({
    success: true,
    id: rank._id,
    timestamp: rank.createdAt,
  });
}
