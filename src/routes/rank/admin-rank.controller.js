import { Rank } from './rank.model.js';

/**
 * DELETE /admin/rank/:id
 */
export async function deleteRank(req, res) {
  const { id } = req.params;

  const rank = await Rank.findByIdAndDelete(id);
  if (!rank) {
    return res.status(404).json({ success: false, message: 'Rank entry not found' });
  }

  return res.status(200).json({ success: true, message: 'Rank entry deleted' });
}
