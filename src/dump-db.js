import path from 'node:path';
import { dumpDb } from './mongo-dump.js';
import { ensureEnv } from './env-helper.js';

const dumpDir = path.resolve('./dump');

const getConfigFromParsingArguments = () => {
  const args = process.argv;
  const from = args.indexOf('-from');
  const env = args[from + 1];

  if (from === -1 || !env) {
    throw new Error('Expected arguments: -from \'environment\'');
  }

  const sanitizedEnv = (env || '').trim().toUpperCase();

  return {
    dumpEnv: {
      dbUri: ensureEnv(`DB_URI_${sanitizedEnv}`),
      dbName: ensureEnv(`DB_NAME_${sanitizedEnv}`)
    }
  };

};

(async () => {
  const { dumpEnv } = getConfigFromParsingArguments();

  await dumpDb({
    uri: dumpEnv.dbUri,
    directory: dumpDir,
    db: dumpEnv.dbName
  });

})();
