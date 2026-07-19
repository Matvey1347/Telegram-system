export const APPLICATION_LOG_SERVICE = 'api';
export const APPLICATION_LOG_HTTP_EXCLUDED_PATHS = [
  /^\/api$/,
  /^\/api\/application-logs(?:\/.*)?$/,
];

export const APPLICATION_LOG_SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'set-cookie',
  'accesstoken',
  'refreshtoken',
  'password',
  'apihash',
  'session',
  'authkey',
  'phonecodehash',
  'otp',
  'code',
  'bot_token',
  'database_url',
  'secret',
  'token',
];
