import path from 'node:path';
import { queue } from 'async';
import { ensureEnv } from './env-helper.js';
import { anonymizeUsers } from './user-helper.js';
import { upsertItemById } from './mongo-helper.js';
import { dumpDb, restoreDb } from './mongo-dump.js';
import { MongoClient, ServerApiVersion } from 'mongodb';
import {
  copyObjectBetweenDifferentS3Accounts,
  copyObjectWithinSameS3Account,
  createS3,
  deleteObject,
  listAllObjects
} from './s3-helper.js';

const OBJECT_COPY_CONCURRENCY = 10;
const LARGE_OBJECT_THRESHOLD_IN_BYTES = 2 * 1000 * 1000;

const dumpDir = path.resolve('./dump');

const percentageFormatter = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 0 });

const ensureConfigForEnv = env => {
  const sanitizedEnv = (env || '').trim().toUpperCase();

  return {
    dbUri: ensureEnv(`DB_URI_${sanitizedEnv}`),
    dbName: ensureEnv(`DB_NAME_${sanitizedEnv}`),
    s3Endpoint: ensureEnv(`S3_ENDPOINT_${sanitizedEnv}`),
    s3Region: ensureEnv(`S3_REGION_${sanitizedEnv}`),
    s3AccessKey: ensureEnv(`S3_ACCESS_KEY_${sanitizedEnv}`),
    s3SecretKey: ensureEnv(`S3_SECRET_KEY_${sanitizedEnv}`),
    s3BucketName: ensureEnv(`S3_BUCKET_NAME_${sanitizedEnv}`)
  };
};

const getConfigFromParsingArguments = () => {
  const args = process.argv;
  const from = args.indexOf('-from');
  const to = args.indexOf('-to');
  const fromEnv = args[from + 1];
  const toEnv = args[to + 1];

  if (from === -1 || to === -1 || !fromEnv || !toEnv) {
    throw new Error('Expected arguments: -from \'fromEnvironment\' -to \'toEnvironment\'');
  }

  const fromConfig = ensureConfigForEnv(fromEnv);
  const toConfig = ensureConfigForEnv(toEnv);

  return {
    sourceEnv: fromConfig,
    destinationEnv: toConfig,
    shouldCopyDbOnly: args.includes('-dbonly'),
    shouldAnonymizeUsers: args.includes('-anonymize'),
    shouldSkipLargeObjects: args.includes('-skiplarge')
  };
};

const canCopyDirectlyWithinS3 = (env1, env2) => {
  return env1.s3Endpoint === env2.s3Endpoint
    && env1.s3Region === env2.s3Region
    && env1.s3AccessKey === env2.s3AccessKey
    && env1.s3SecretKey === env2.s3SecretKey;
};

(async () => {

  const { sourceEnv, destinationEnv, shouldCopyDbOnly, shouldAnonymizeUsers, shouldSkipLargeObjects } = getConfigFromParsingArguments();
  const isSameS3Account = canCopyDirectlyWithinS3(sourceEnv, destinationEnv);

  console.log(`Copying from\n${JSON.stringify(sourceEnv)}\nto\n${JSON.stringify(destinationEnv)}`);

  await dumpDb({
    uri: sourceEnv.dbUri,
    directory: dumpDir,
    db: sourceEnv.dbName
  });

  await restoreDb({
    uri: destinationEnv.dbUri,
    directory: dumpDir,
    fromDb: sourceEnv.dbName,
    toDb: destinationEnv.dbName
  });

  if (shouldAnonymizeUsers) {
    const mongoOptions = { useUnifiedTopology: true, serverApi: ServerApiVersion.v1 };
    const mongoClient = await MongoClient.connect(destinationEnv.dbUri, mongoOptions);
    const usersCollection = await mongoClient.db().collection('users');

    const users = await usersCollection.find({}).toArray();
    const updatedUsers = await anonymizeUsers(users);

    for (const user of updatedUsers) {
      console.log(`Updating anonymized user ${user.displayName}`);
      await upsertItemById(usersCollection, user);
    }

    await mongoClient.close();
  }

  if (shouldCopyDbOnly) {
    console.log('SUCESSFULLY FINISHED!');
    return;
  }

  const sourceS3 = createS3(sourceEnv);
  const destinationS3 = isSameS3Account ? sourceS3 : createS3(destinationEnv);

  console.log(`Deleting old objects from destination: ${destinationEnv.s3BucketName}`);
  const oldObjects = await listAllObjects({ s3: destinationS3, bucketName: destinationEnv.s3BucketName });
  for (const obj of oldObjects) {
    console.log(`Deleting object ${obj.Key}`);
    await deleteObject(destinationS3, destinationEnv.s3BucketName, obj.Key);
  }

  console.log(`Listing all objects from source: ${sourceEnv.s3BucketName}`);
  const sourceObjects = await listAllObjects({ s3: sourceS3, bucketName: sourceEnv.s3BucketName });

  console.log(`Copying ${sourceObjects.length} objects ${isSameS3Account ? 'within S3' : 'between S3 accounts'}  from ${sourceEnv.s3BucketName} to ${destinationEnv.s3BucketName}`);

  let errorOccurred = false;
  const copyObject = isSameS3Account
    ? obj => copyObjectWithinSameS3Account({
      s3: sourceS3,
      sourceBucketName: sourceEnv.s3BucketName,
      destinationBucketName: destinationEnv.s3BucketName,
      objectKey: obj.Key
    })
    : obj => copyObjectBetweenDifferentS3Accounts({
      sourceS3,
      destinationS3,
      sourceBucketName: sourceEnv.s3BucketName,
      destinationBucketName: destinationEnv.s3BucketName,
      objectKey: obj.Key
    });

  const q = queue(({ obj, index }, callback) => {
    const percentage = percentageFormatter.format((index + 1) / sourceObjects.length);
    if (shouldSkipLargeObjects && obj.Size > LARGE_OBJECT_THRESHOLD_IN_BYTES) {
      console.log(`[${percentage}] SKIP object ${obj.Key}`);
      Promise.resolve().then(() => callback?.());
    } else {
      console.log(`[${percentage}] COPY object ${obj.Key}`);
      copyObject(obj).then(() => callback?.(), err => callback?.(err));
    }
  }, OBJECT_COPY_CONCURRENCY);

  q.error((err, { obj }) => {
    console.error(`Error while copying ${obj.key}`, err);
    errorOccurred = true;
    q.remove(() => true);
  });

  q.push(sourceObjects.map((obj, index) => ({ obj, index })));

  await q.drain();

  if (errorOccurred) {
    console.error('CANCELLED BECAUSE OF ERRORS!');
  } else {
    console.log('SUCESSFULLY FINISHED!');
  }

})();
