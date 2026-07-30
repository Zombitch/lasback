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
 * Look up a submission's value for an arbitrary label, given the doc's
 * parallel `labels`/`values` arrays. `null` when the doc doesn't carry it.
 */
function valueForLabel(doc, lbl) {
  const idx = doc.labels.indexOf(lbl);
  return idx === -1 ? null : doc.values[idx];
}

/**
 * GET /rank
 *
 * Look up a userId's rank among all submissions carrying the given label.
 * Primary order is by that label's value (highest first); ties are broken,
 * in order, by additionalLabels — first additionalLabels[0]'s value, then
 * additionalLabels[1]'s, and so on. A user missing one of those tie-break
 * labels sorts as if they had -Infinity for it (so they lose the tie to
 * anyone who actually has a value, but still tie with other users equally
 * missing it). Returns the 5 entries ranked immediately above and below too.
 *
 * Query params: userId, label, source (all required — ranking is always
 * scoped to a single source, otherwise values from unrelated games/sites
 * would be compared against each other)
 *   additionalLabels (optional) — comma-separated label names (e.g.
 *   "Clones,Floor"), used both as the tie-break chain above and to attach
 *   an `additionalValues` object (that user's value per label, when present)
 *   to the target user and every before/after neighbor in the response.
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
      { $project: { _id: 0, userId: 1, value: '$__value', labels: 1, values: 1 } },
    ]);

    // Primary sort by the requested label's value, then walk additionalLabels
    // in order to break ties — done in JS since the tie-break chain has a
    // variable number of dynamic label names, which $sort can't express.
    entries.sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value;
      for (const lbl of additionalLabels) {
        const av = valueForLabel(a, lbl) ?? -Infinity;
        const bv = valueForLabel(b, lbl) ?? -Infinity;
        if (bv !== av) return bv - av;
      }
      return 0;
    });

    const targetIndex = entries.findIndex((e) => e.userId === userId);

    if (targetIndex === -1) {
      return res
        .status(404)
        .json({ success: false, message: 'No submission found for this userId and label' });
    }

    const before = entries.slice(Math.max(0, targetIndex - 5), targetIndex);
    const after = entries.slice(targetIndex + 1, targetIndex + 6);

    function additionalValuesFor(entry) {
      const vals = {};
      for (const lbl of additionalLabels) {
        const v = valueForLabel(entry, lbl);
        if (v !== null) vals[lbl] = v;
      }
      return vals;
    }

    // Response only ever exposes userId/value(+additionalValues) — the raw
    // labels/values arrays fetched for sorting never leak past this point.
    function toPublic(entry) {
      const pub = { userId: entry.userId, value: entry.value };
      if (additionalLabels.length) pub.additionalValues = additionalValuesFor(entry);
      return pub;
    }

    return res.json({
      success: true,
      userId,
      label,
      source,
      rank: targetIndex + 1,
      total: entries.length,
      value: entries[targetIndex].value,
      ...(additionalLabels.length ? { additionalValues: additionalValuesFor(entries[targetIndex]) } : {}),
      before: before.map(toPublic),
      after: after.map(toPublic),
    });
  } catch (err) {
    next(err);
  }
}
