import { config } from '../../utils/configLoader.js';
import { Visit } from './visit.model.js'

export async function postVisit(req, res) {
    const userAgent = req.headers['user-agent'];
    const clientIp = req.ip;
    const url = req.body?.url;
    const lang = req.body?.lang;
    const referer = req.body?.referer;
    if(clientIp && userAgent && url){
        const visit = await Visit.create({
            ip: clientIp,
            agent: userAgent,
            url: url,
            lang: lang,
            origin: origin
        });
        res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
    }else {
        res.status(400).json({ status: 'ko', uptime: process.uptime(), timestamp: new Date().toISOString() });
    }
}

export async function getVisit(req, res) {
    const visits = await Visit.find();
    res.status(200).json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        visits: visits
    });
}
