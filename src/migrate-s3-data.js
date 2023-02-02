import { queue } from 'async';
import { ensureEnv } from './env-helper.js';
import {
  createS3,
  deleteObject,
  listAllObjects,
  copyObjectWithinSameBucket
} from './s3-helper.js';

const OBJECT_MIGRATION_CONCURRENCY = 10;

const percentageFormatter = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 0 });

const ensureConfigForEnv = env => {
  const sanitizedEnv = (env || '').trim().toUpperCase();

  return {
    s3Endpoint: ensureEnv(`S3_ENDPOINT_${sanitizedEnv}`),
    s3Region: ensureEnv(`S3_REGION_${sanitizedEnv}`),
    s3AccessKey: ensureEnv(`S3_ACCESS_KEY_${sanitizedEnv}`),
    s3SecretKey: ensureEnv(`S3_SECRET_KEY_${sanitizedEnv}`),
    s3BucketName: ensureEnv(`S3_BUCKET_NAME_${sanitizedEnv}`)
  };
};

const getConfigFromParsingArguments = () => {
  const args = process.argv;
  const on = args.indexOf('-on');
  const onEnv = args[on + 1];

  if (onEnv === -1 || !onEnv) {
    throw new Error('Expected arguments: -env \'environment\'');
  }

  const envConfig = ensureConfigForEnv(onEnv);

  return {
    sourceEnv: envConfig
  };
};

const shouldMigrateObject = obj => {
  return obj.Key.startsWith('media/') || obj.Key.startsWith('rooms/');
};

const getNewObjectKey = obj => {
  if (obj.Key.startsWith('media/')) {
    return obj.Key.replace('media/', 'document-media/');
  }

  if (obj.Key.startsWith('rooms/')) {
    return obj.Key.replace('rooms/', 'room-media/').replace('/media/', '/');
  }

  return null;
};

(async () => {

  const { sourceEnv } = getConfigFromParsingArguments();
  console.log(`Changing data structure on \n${JSON.stringify(sourceEnv)}\n`);

  const sourceS3 = createS3(sourceEnv);

  console.log(`Listing all objects from source: ${sourceEnv.s3BucketName}`);
  const sourceObjects = await listAllObjects({ s3: sourceS3, bucketName: sourceEnv.s3BucketName });
  const objectsToMigrate = sourceObjects.filter(shouldMigrateObject);

  console.log(`Migrating ${objectsToMigrate.length} objects within S3 on ${sourceEnv.s3BucketName}`);

  let errorOccurred = false;

  const migrateObject = (obj, newObjectKey) => {
    return copyObjectWithinSameBucket({
      sourceS3,
      sourceBucketName: sourceEnv.s3BucketName,
      objectKey: obj.Key,
      newObjectKey
    });
  };

  const q = queue(({ obj, index }, callback) => {
    const newObjectKey = getNewObjectKey(obj);
    if (newObjectKey) {
      console.log(`[${percentageFormatter.format((index + 1) / objectsToMigrate.length)}] Migrating object to ${newObjectKey}`);
      migrateObject(obj, newObjectKey).then(() => callback?.(), err => callback?.(err));
    }
  }, OBJECT_MIGRATION_CONCURRENCY);

  q.error((err, { obj }) => {
    console.error(`Error while copying ${obj.key}`, err);
    errorOccurred = true;
    q.remove(() => true);
  });

  q.push(objectsToMigrate.map((obj, index) => ({ obj, index })));

  await q.drain();

  if (errorOccurred) {
    console.error('CANCELLED BECAUSE OF ERRORS!');
  } else {
    console.log('SUCESSFULLY MIGRATED!');

    console.log(`Deleting old objects within S3 on ${sourceEnv.s3BucketName}`);
    for (const obj of objectsToMigrate) {
      console.log(`Deleting object ${obj.Key}`);
      await deleteObject(sourceS3, sourceEnv.s3BucketName, obj.Key);
    }
    console.log(`Deleted ${objectsToMigrate.length} objects within S3 on ${sourceEnv.s3BucketName}`);

    console.log('SUCESSFULLY FINISHED!');
  }

})();
