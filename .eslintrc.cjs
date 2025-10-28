module.exports = {
  env: {
    node: true,
    es2023: true,
  },
  extends: [
    'standard',
    'plugin:security/recommended',
    'prettier' // keep this last so prettier wins formatting fights
  ],
  plugins: ['security'],
  parserOptions: {
    sourceType: 'module',
  },
  rules: {
    // good defaults, tweak as team prefers
    'no-console': 'warn',
    'security/detect-object-injection': 'off', // often too noisy in API code
  },
};
