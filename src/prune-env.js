import { ensureEnv } from './env-helper.js';
import { dropAllCollections } from './mongo-helper.js';
import { MongoClient, ServerApiVersion } from 'mongodb';
import { createS3, deleteAllObjects } from './s3-helper.js';

const getConfigFromParsingArguments = () => {
  const args = process.argv;
  const on = args.indexOf('-on');
  const onEnv = args[on + 1];

  if (on === -1 || !onEnv) {
    throw new Error('Expected arguments: -on \'environment\'');
  }

  const sanitizedEnv = onEnv.trim().toUpperCase();

  return {
    pruneEnv: {
      dbUri: ensureEnv(`DB_URI_${sanitizedEnv}`),
      dbName: ensureEnv(`DB_NAME_${sanitizedEnv}`),
      s3Endpoint: ensureEnv(`S3_ENDPOINT_${sanitizedEnv}`),
      s3Region: ensureEnv(`S3_REGION_${sanitizedEnv}`),
      s3AccessKey: ensureEnv(`S3_ACCESS_KEY_${sanitizedEnv}`),
      s3SecretKey: ensureEnv(`S3_SECRET_KEY_${sanitizedEnv}`),
      s3BucketName: ensureEnv(`S3_BUCKET_NAME_${sanitizedEnv}`)
    }
  };
};

(async () => {

  const { pruneEnv } = getConfigFromParsingArguments();

  console.log(`Pruning \n${JSON.stringify(pruneEnv)}\n`);

  const mongoOptions = { serverApi: ServerApiVersion.v1 };
  const mongoClient = await MongoClient.connect(pruneEnv.dbUri, mongoOptions);
  const db = mongoClient.db();
  await dropAllCollections(db);
  await mongoClient.close();

  const s3 = createS3(pruneEnv);

  await deleteAllObjects(s3, pruneEnv.s3BucketName);

})();
