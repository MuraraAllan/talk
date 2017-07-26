// This file serves as the entrypoint to all configuration loaded by the
// application. All defaults are assumed here, validation should also be
// completed here.

// Perform rewrites to the runtime environment variables based on the contents
// of the process.env.REWRITE_ENV if it exists. This is done here as it is the
// entrypoint for the entire applications configuration.
require('env-rewrite').rewrite();

const debug = require('debug')('talk:config');

//==============================================================================
// CONFIG INITIALIZATION
//==============================================================================

const CONFIG = {

  // WEBPACK indicates when webpack is currently building.
  WEBPACK: process.env.WEBPACK === 'true',

  //------------------------------------------------------------------------------
  // JWT based configuration
  //------------------------------------------------------------------------------

  // JWT_SECRET is the secret used to sign and verify tokens issued by this
  // application.
  JWT_SECRET: process.env.TALK_JWT_SECRET || null,

  JWT_SECRETS: process.env.TALK_JWT_SECRETS || null,

  // JWT_AUDIENCE is the value for the audience claim for the tokens that will be
  // verified when decoding. If `JWT_AUDIENCE` is not in the environment, then it
  // will default to `talk`.
  JWT_AUDIENCE: process.env.TALK_JWT_AUDIENCE || 'talk',

  // JWT_ISSUER is the value for the issuer for the tokens that will be verified
  // when decoding. If `JWT_ISSUER` is not in the environment, then it will try
  // `TALK_ROOT_URL`, otherwise, it will be undefined.
  JWT_ISSUER: process.env.TALK_JWT_ISSUER || process.env.TALK_ROOT_URL,

  // JWT_EXPIRY is the time for which a given token is valid for.
  JWT_EXPIRY: process.env.TALK_JWT_EXPIRY || '1 day',

  // JWT_ALG is the algorithm used for signing jwt tokens.
  JWT_ALG: process.env.TALK_JWT_ALG || 'HS256',

  //------------------------------------------------------------------------------
  // Installation locks
  //------------------------------------------------------------------------------

  INSTALL_LOCK: process.env.TALK_INSTALL_LOCK === 'TRUE',

  //------------------------------------------------------------------------------
  // External database url's
  //------------------------------------------------------------------------------

  MONGO_URL: process.env.TALK_MONGO_URL,
  REDIS_URL: process.env.TALK_REDIS_URL,

  //------------------------------------------------------------------------------
  // Server Config
  //------------------------------------------------------------------------------

  // Port to bind to.
  PORT: process.env.TALK_PORT || '3000',

  // The URL for this Talk Instance as viewable from the outside.
  ROOT_URL: process.env.TALK_ROOT_URL,

  // The keepalive timeout (in ms) that should be used to send keep alive
  // messages through the websocket to keep the socket alive.
  KEEP_ALIVE: process.env.TALK_KEEP_ALIVE || '30s',

  //------------------------------------------------------------------------------
  // Recaptcha configuration
  //------------------------------------------------------------------------------

  RECAPTCHA_ENABLED: false, // updated below
  RECAPTCHA_PUBLIC: process.env.TALK_RECAPTCHA_PUBLIC,
  RECAPTCHA_SECRET: process.env.TALK_RECAPTCHA_SECRET,

  //------------------------------------------------------------------------------
  // SMTP Server configuration
  //------------------------------------------------------------------------------

  SMTP_FROM_ADDRESS: process.env.TALK_SMTP_FROM_ADDRESS,
  SMTP_HOST: process.env.TALK_SMTP_HOST,
  SMTP_PASSWORD: process.env.TALK_SMTP_PASSWORD,
  SMTP_PORT: process.env.TALK_SMTP_PORT,
  SMTP_USERNAME: process.env.TALK_SMTP_USERNAME,

  //------------------------------------------------------------------------------
  // Flagging Config
  //------------------------------------------------------------------------------

  // DISABLE_AUTOFLAG_SUSPECT_WORDS is true when the suspect words that are
  // matched should not be flagged.
  DISABLE_AUTOFLAG_SUSPECT_WORDS: process.env.TALK_DISABLE_AUTOFLAG_SUSPECT_WORDS === 'TRUE'
};

//==============================================================================
// CONFIG VALIDATION
//==============================================================================

//------------------------------------------------------------------------------
// JWT based configuration
//------------------------------------------------------------------------------

const jwt = require('./services/jwt');

if (CONFIG.JWT_SECRETS) {
  CONFIG.JWT_SECRETS = JSON.parse(CONFIG.JWT_SECRETS);
  if (!Array.isArray(CONFIG.JWT_SECRETS)) {
    throw new Error('TALK_JWT_SECRETS must be a JSON array in the form [{"kid": kid, ["secret": secret | "private": private, "public": public]}, ...]');
  }

  if (CONFIG.JWT_SECRETS.length === 0) {
    throw new Error('TALK_JWT_SECRETS must be a JSON array with non zero length');
  }

  // Wrap a multi-secret around the available secrets.
  CONFIG.JWT_SECRET = new jwt.MultiSecret(CONFIG.JWT_SECRETS.map((secret) => {
    if (!('kid' in secret)) {
      throw new Error('when multiple keys are specified, kid\'s must be specified');
    }

    // HMAC secrets do not have public/private keys.
    if (CONFIG.JWT_ALG.startsWith('HS')) {
      return new jwt.SharedSecret(secret, CONFIG.JWT_ALG);
    }

    if (!('public' in secret)) {
      throw new Error('all symetric keys must provide a PEM encoded public key');
    }

    return new jwt.AsymmetricSecret(secret, CONFIG.JWT_ALG);
  }));

  debug(`loaded ${CONFIG.JWT_SECRET.length} secrets`);
} else if (CONFIG.JWT_SECRET) {
  if (CONFIG.JWT_ALG.startsWith('HS')) {
    CONFIG.JWT_SECRET = new jwt.SharedSecret({
      secret: CONFIG.JWT_SECRET
    }, CONFIG.JWT_ALG);
  } else {
    CONFIG.JWT_SECRET = new jwt.AsymmetricSecret(JSON.parse(CONFIG.JWT_SECRET), CONFIG.JWT_ALG);
  }

  debug('loaded 1 secret');
}

if (process.env.NODE_ENV === 'test' && !CONFIG.JWT_SECRET) {
  CONFIG.JWT_SECRET = new jwt.SharedSecret({
    secret: 'keyboard cat'
  }, CONFIG.JWT_ALG);
} else if (!CONFIG.JWT_SECRET) {
  throw new Error(
    'TALK_JWT_SECRET must be provided in the environment to sign/verify tokens'
  );
}

//------------------------------------------------------------------------------
// External database url's
//------------------------------------------------------------------------------

// Reset the mongo url in the event it hasn't been overrided and we are in a
// testing environment. Every new mongo instance comes with a test database by
// default, this is consistent with common testing and use case practices.
if (process.env.NODE_ENV === 'test' && !CONFIG.MONGO_URL) {
  CONFIG.MONGO_URL = 'mongodb://localhost/test';
}

// Reset the redis url in the event it hasn't been overrided and we are in a
// testing environment.
if (process.env.NODE_ENV === 'test' && !CONFIG.REDIS_URL) {
  CONFIG.REDIS_URL = 'redis://localhost/1';
}

//------------------------------------------------------------------------------
// Recaptcha configuration
//------------------------------------------------------------------------------

/**
 * This is true when the recaptcha secret is provided and the Recaptcha feature
 * is to be enabled.
 */
CONFIG.RECAPTCHA_ENABLED =
  CONFIG.RECAPTCHA_SECRET &&
  CONFIG.RECAPTCHA_SECRET.length > 0 &&
  CONFIG.RECAPTCHA_PUBLIC &&
  CONFIG.RECAPTCHA_PUBLIC.length > 0;
if (!CONFIG.RECAPTCHA_ENABLED) {
  console.warn(
    'Recaptcha is not enabled for login/signup abuse prevention, set TALK_RECAPTCHA_SECRET and TALK_RECAPTCHA_PUBLIC to enable Recaptcha.'
  );
}

//------------------------------------------------------------------------------
// SMTP Server configuration
//------------------------------------------------------------------------------

{
  const requiredProps = [
    'SMTP_FROM_ADDRESS',
    'SMTP_USERNAME',
    'SMTP_PASSWORD',
    'SMTP_HOST'
  ];

  if (requiredProps.some((prop) => !CONFIG[prop])) {
    console.warn(
      `${requiredProps
        .map((v) => `TALK_${v}`)
        .join(
          ', '
        )} should be defined in the environment if you would like to send password reset emails from Talk`
    );
  }
}

module.exports = CONFIG;
