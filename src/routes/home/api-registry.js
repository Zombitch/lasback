/**
 * Single source of truth for the API tab (docs + live tester).
 *
 * `method` + `path` here are what the server actually calls when a request
 * comes in through POST /dashboard/api-tester — the browser only ever sends
 * an `apiId` plus user-edited params/query/body, never a raw path. This is
 * what keeps the tester from being an open SSRF/proxy: only routes listed
 * here can ever be reached, and path segments are always encoded before
 * being substituted in.
 *
 * `requiresJwt` controls whether the tester shows an editable Authorization
 * field; `x-api-key` is never editable — the server injects it from
 * config.apiKeys.
 */
export const apiRegistry = {
  'analytics-event': {
    method: 'POST',
    path: '/analytics/event',
    requiresJwt: false,
    description: 'Enregistre un événement analytics (action utilisateur, in-game, etc.).',
    docHeaders: [
      { name: 'x-api-key', value: '<votre clé API>' },
      { name: 'Content-Type', value: 'application/json' },
    ],
    body: {
      source: 'my-game',
      version: '1.0.0',
      userId: 'player-123',
      sessionId: 'a1b2c3d4',
      action: 'level_up',
      category: 'gameplay',
      platform: 'web',
      value: '42',
      duration: 1500,
      metadata: { level: 5 },
    },
    bodyNote: 'Seul `action` est obligatoire, tous les autres champs sont optionnels.',
    response: {
      success: true,
      id: '6650f1a2b3c4d5e6f7089012',
      timestamp: '2026-07-29T12:00:00.000Z',
    },
  },
  'analytics-events': {
    method: 'GET',
    path: '/analytics/events',
    requiresJwt: false,
    description: "Liste paginée des événements bruts, filtrable et triée du plus récent au plus ancien.",
    docHeaders: [{ name: 'x-api-key', value: '<votre clé API>' }],
    query: [
      { name: 'source', note: 'optionnel — filtre exact' },
      { name: 'action', note: 'optionnel — filtre exact' },
      { name: 'category', note: 'optionnel — filtre exact' },
      { name: 'userId', note: 'optionnel — filtre exact' },
      { name: 'sessionId', note: 'optionnel — filtre exact' },
      { name: 'country', note: 'optionnel — filtre exact' },
      { name: 'from', note: 'optionnel — date ISO' },
      { name: 'to', note: 'optionnel — date ISO' },
      { name: 'page', note: 'optionnel — défaut 1' },
      { name: 'limit', note: 'optionnel — défaut 50, max 500' },
    ],
    response: {
      success: true,
      total: 1523,
      page: 1,
      limit: 50,
      pages: 31,
      events: [{ _id: '6650f1a2b3c4d5e6f7089012', action: 'level_up', source: 'my-game' }],
    },
  },
  'analytics-stats': {
    method: 'GET',
    path: '/analytics/stats',
    requiresJwt: false,
    description: 'Retourne des statistiques agrégées (par source, action, pays, plateforme, jour…).',
    docHeaders: [{ name: 'x-api-key', value: '<votre clé API>' }],
    query: [
      { name: 'source', note: 'optionnel — filtre par source' },
      { name: 'from', note: 'optionnel — date ISO (incluse)' },
      { name: 'to', note: 'optionnel — date ISO (incluse)' },
    ],
    response: {
      success: true,
      total: 1523,
      uniqueUsers: 340,
      uniqueSessions: 512,
      avgValue: 27.4,
      avgDuration: 842,
      totalDuration: 128000,
      bySource: [{ _id: 'my-game', count: 1523 }],
      byAction: [{ _id: 'level_up', count: 210 }],
      byDay: [{ _id: '2026-07-29', count: 12 }],
    },
  },
  'rank-post': {
    method: 'POST',
    path: '/rank',
    requiresJwt: false,
    description: 'Enregistre une soumission de valeurs classées (score, stats…) associées à des labels.',
    docHeaders: [
      { name: 'x-api-key', value: '<votre clé API>' },
      { name: 'Content-Type', value: 'application/json' },
    ],
    body: {
      source: 'my-game',
      version: '1.0.0',
      userId: 'player-123',
      values: [10, 42, 3],
      labels: ['strength', 'speed', 'luck'],
    },
    bodyNote:
      '`values` et `labels` doivent être des tableaux de même taille : values[i] correspond à labels[i]. Une nouvelle soumission remplace la précédente pour le même userId/source.',
    response: {
      success: true,
      id: '6650f1a2b3c4d5e6f7089099',
      timestamp: '2026-07-29T12:00:00.000Z',
    },
  },
  'rank-get': {
    method: 'GET',
    path: '/rank',
    requiresJwt: false,
    description: "Retourne le classement d'un userId pour un label donné (égalités départagées par additionalLabels, dans l'ordre), avec les 5 entrées au-dessus et en dessous.",
    docHeaders: [{ name: 'x-api-key', value: '<votre clé API>' }],
    query: [
      { name: 'userId', note: 'requis' },
      { name: 'label', note: 'requis' },
      { name: 'source', note: 'requis' },
      { name: 'additionalLabels', note: "optionnel — labels séparés par virgule, ex: Clones,Floor. Départagent les égalités sur `label` dans l'ordre donné, et sont renvoyés en plus dans additionalValues" },
    ],
    response: {
      success: true,
      userId: 'player-123',
      label: 'strength',
      source: 'my-game',
      rank: 12,
      total: 340,
      value: 87,
      additionalValues: { Clones: 4, Floor: 12 },
      before: [{ userId: 'player-045', value: 91, additionalValues: { Clones: 6, Floor: 15 } }],
      after: [{ userId: 'player-198', value: 83, additionalValues: { Clones: 2, Floor: 9 } }],
    },
  },
  'auth-register': {
    method: 'POST',
    path: '/v1/auth/register',
    requiresJwt: false,
    description: 'Crée un compte joueur et retourne un JWT.',
    docHeaders: [
      { name: 'x-api-key', value: '<votre clé API>' },
      { name: 'Content-Type', value: 'application/json' },
    ],
    body: {
      username: 'PlayerOne',
      email: 'player@example.com',
      password: 'hunter22',
    },
    bodyNote: '`username` ≥ 3 caractères, `password` 8–72 caractères.',
    response: {
      success: true,
      token: '<jwt>',
      player: { id: '6650f1a2b3c4d5e6f7089001', username: 'PlayerOne', email: 'player@example.com' },
    },
  },
  'auth-login': {
    method: 'POST',
    path: '/v1/auth/login',
    requiresJwt: false,
    description: 'Authentifie un joueur existant et retourne un JWT.',
    docHeaders: [
      { name: 'x-api-key', value: '<votre clé API>' },
      { name: 'Content-Type', value: 'application/json' },
    ],
    body: {
      email: 'player@example.com',
      password: 'hunter22',
    },
    response: {
      success: true,
      token: '<jwt>',
      player: { id: '6650f1a2b3c4d5e6f7089001', username: 'PlayerOne', email: 'player@example.com' },
    },
  },
  'saves-create': {
    method: 'POST',
    path: '/v1/games/:gameId/saves/:slotKey',
    requiresJwt: true,
    description:
      "Crée une nouvelle version de sauvegarde pour le joueur authentifié (identifié via le JWT, jamais via le body).",
    docHeaders: [
      { name: 'x-api-key', value: '<votre clé API>' },
      { name: 'Authorization', value: 'Bearer <jwt>' },
      { name: 'Content-Type', value: 'application/json' },
    ],
    params: [
      { name: 'gameId', note: 'identifiant du jeu' },
      { name: 'slotKey', note: '1-50 caractères — identifie le slot de sauvegarde' },
    ],
    body: {
      payload: { level: 12, gold: 340, inventory: ['sword', 'shield'] },
      clientBuild: '1.4.2',
    },
    bodyNote: '`payload` doit être un objet JSON (pas un tableau).',
    response: {
      success: true,
      version: 7,
      id: '6650f1a2b3c4d5e6f7089033',
      payloadHash: 'e3b0c44298fc1c1...',
      createdAt: '2026-07-29T12:00:00.000Z',
    },
  },
  'saves-latest': {
    method: 'GET',
    path: '/v1/games/:gameId/saves/:slotKey/latest',
    requiresJwt: true,
    description: "Retourne la sauvegarde la plus récente d'un slot, payload complet inclus.",
    docHeaders: [
      { name: 'x-api-key', value: '<votre clé API>' },
      { name: 'Authorization', value: 'Bearer <jwt>' },
    ],
    params: [
      { name: 'gameId', note: 'identifiant du jeu' },
      { name: 'slotKey', note: 'identifiant du slot' },
    ],
    response: {
      success: true,
      save: {
        id: '6650f1a2b3c4d5e6f7089033',
        version: 7,
        payload: { level: 12, gold: 340 },
        payloadHash: 'e3b0c44298fc1c1...',
        clientBuild: '1.4.2',
        createdAt: '2026-07-29T12:00:00.000Z',
      },
    },
  },
  'saves-list': {
    method: 'GET',
    path: '/v1/games/:gameId/saves/:slotKey',
    requiresJwt: true,
    description:
      "Liste les métadonnées des versions d'un slot (sans payload), triées de la plus récente à la plus ancienne.",
    docHeaders: [
      { name: 'x-api-key', value: '<votre clé API>' },
      { name: 'Authorization', value: 'Bearer <jwt>' },
    ],
    params: [
      { name: 'gameId', note: 'identifiant du jeu' },
      { name: 'slotKey', note: 'identifiant du slot' },
    ],
    query: [
      { name: 'limit', note: 'optionnel — défaut 50, max 101' },
      { name: 'before', note: 'optionnel — curseur ISO, ne renvoie que les versions plus anciennes' },
    ],
    response: {
      success: true,
      slotKey: 'main-save',
      currentVersion: 7,
      versions: [
        { id: '6650f1a2b3c4d5e6f7089033', version: 7, payloadHash: 'e3b0c44...', createdAt: '2026-07-29T12:00:00.000Z' },
      ],
    },
  },
  'saves-version': {
    method: 'GET',
    path: '/v1/games/:gameId/saves/:slotKey/:version',
    requiresJwt: true,
    description: "Retourne une version spécifique d'une sauvegarde, payload complet inclus.",
    docHeaders: [
      { name: 'x-api-key', value: '<votre clé API>' },
      { name: 'Authorization', value: 'Bearer <jwt>' },
    ],
    params: [
      { name: 'gameId', note: 'identifiant du jeu' },
      { name: 'slotKey', note: 'identifiant du slot' },
      { name: 'version', note: 'numéro de version (entier)' },
    ],
    response: {
      success: true,
      save: {
        id: '6650f1a2b3c4d5e6f7089020',
        version: 3,
        payload: { level: 8, gold: 120 },
        payloadHash: 'a1b2c3d4e5f6...',
        clientBuild: '1.3.0',
        createdAt: '2026-06-01T09:00:00.000Z',
      },
    },
  },
  'feature-get': {
    method: 'GET',
    path: '/feature-interruptor',
    requiresJwt: false,
    description: "Retourne le statut activé/désactivé d'une fonctionnalité pour une app donnée.",
    docHeaders: [{ name: 'x-api-key', value: '<votre clé API>' }],
    query: [
      { name: 'appId', note: 'requis' },
      { name: 'featureId', note: 'requis' },
      { name: 'featureName', note: 'optionnel' },
    ],
    response: {
      success: true,
      appId: 'my-app',
      appName: 'My App',
      featureId: 'new-shop',
      featureName: 'New Shop UI',
      value: true,
    },
  },
  'visit-post': {
    method: 'POST',
    path: '/visit',
    requiresJwt: false,
    description:
      "Enregistre une visite (url, langue, origine). L'IP et le user-agent sont lus automatiquement depuis la requête.",
    docHeaders: [
      { name: 'x-api-key', value: '<votre clé API>' },
      { name: 'Content-Type', value: 'application/json' },
    ],
    body: {
      url: 'https://my-game.com/home',
      lang: 'fr-FR',
      origin: 'https://my-game.com',
    },
    response: { status: 'ok' },
  },
  'visit-get': {
    method: 'GET',
    path: '/visit',
    requiresJwt: false,
    description: 'Liste les 500 dernières visites enregistrées.',
    docHeaders: [{ name: 'x-api-key', value: '<votre clé API>' }],
    response: {
      status: 'ok',
      visits: [{ ip: '203.0.113.4', agent: 'Mozilla/5.0…', url: 'https://my-game.com/home', createdAt: '2026-07-29T12:00:00.000Z' }],
    },
  },
};
