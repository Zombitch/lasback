import { Visit } from './visit.model.js';

export async function postVisit(req, res) {
  const userAgent = req.headers['user-agent']?.slice(0, 500);
  const clientIp = req.ip;
  const url = typeof req.body?.url === 'string' ? req.body.url.trim().slice(0, 2000) : undefined;
  const lang = typeof req.body?.lang === 'string' ? req.body.lang.trim().slice(0, 50) : undefined;
  const origin =
    typeof req.body?.origin === 'string' ? req.body.origin.trim().slice(0, 500) : undefined;

  if (clientIp && userAgent && url) {
    await Visit.create({
      ip: clientIp,
      agent: userAgent,
      url,
      lang,
      origin,
    });
    res.status(200).json({ status: 'ok' });
  } else {
    res.status(400).json({ status: 'ko', message: 'Missing required fields (ip, userAgent, url)' });
  }
}

export async function getVisit(req, res) {
  const visits = await Visit.find().sort({ createdAt: -1 }).limit(500).lean();
  res.status(200).json({
    status: 'ok',
    visits,
  });
}
