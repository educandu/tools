import { queue } from 'async';
import uniqueId from './unique-id.js';
import { ensureEnv } from './env-helper.js';
import { MongoClient, ServerApiVersion } from 'mongodb';
import { getContentType, getResourceType, splitFileNameAtExtension } from './resource-helper.js';
import { createS3, deleteObject, listAllObjects, copyObjectWithinSameBucket } from './s3-helper.js';

const OBJECT_MIGRATION_CONCURRENCY = 20;

const CDN_DOCUMENT_MEDIA_REGEX = /document-media\/(.+)\//;
const CDN_MEDIA_LIBRARY_PREFIX = 'media-library/';

const LICENCE = 'CC-BY-SA-4.0';
const DEFAULT_TAG = 'generic';

const getConfigFromParsingArguments = () => {
  const args = process.argv;
  const on = args.indexOf('-on');
  const onEnv = args[on + 1];

  if (on === -1 || !onEnv) {
    throw new Error('Expected arguments: -on \'environment\'');
  }

  const sanitizedEnv = onEnv.trim().toUpperCase();

  return {
    sourceEnv: {
      dbUri: ensureEnv(`DB_URI_${sanitizedEnv}`),
      s3Endpoint: ensureEnv(`S3_ENDPOINT_${sanitizedEnv}`),
      s3Region: ensureEnv(`S3_REGION_${sanitizedEnv}`),
      s3AccessKey: ensureEnv(`S3_ACCESS_KEY_${sanitizedEnv}`),
      s3SecretKey: ensureEnv(`S3_SECRET_KEY_${sanitizedEnv}`),
      s3BucketName: ensureEnv(`S3_BUCKET_NAME_${sanitizedEnv}`)
    }
  };
};

const shouldMigrateObject = obj => {
  return CDN_DOCUMENT_MEDIA_REGEX.test(obj.Key);
};

const getNewObjectKey = obj => {
  if (shouldMigrateObject(obj) && !obj.Key.includes('__DIRMARKER__')) {
    return obj.Key.replace(CDN_DOCUMENT_MEDIA_REGEX, CDN_MEDIA_LIBRARY_PREFIX);
  }

  return null;
};

const getDocumentIdFromObjectKey = obj => {
  const match = obj.Key.match(CDN_DOCUMENT_MEDIA_REGEX);
  return match?.[1] || null;
};

const getResourceTags = ({ fileName, documentId }) => {
  const { baseName } = splitFileNameAtExtension(fileName);
  const sanitizedTags = baseName
    .toLowerCase()
    .split('-')
    .reduce((accu, part) => [...accu, ...part.split(' ')], [])
    .reduce((accu, part) => [...accu, ...part.split('_')], [])
    .map(part => part.trim())
    .filter(tag => tag.length > 2)
    // drop generated file ID
    .slice(0, -1);

  return sanitizedTags.length ? [...sanitizedTags, documentId] : [DEFAULT_TAG, documentId];
};

(async () => {
  const { sourceEnv } = getConfigFromParsingArguments();

  const mongoOptions = { useUnifiedTopology: true, serverApi: ServerApiVersion.v1 };
  const mongoClient = await MongoClient.connect(sourceEnv.dbUri, mongoOptions);

  const mediaLibraryItemsCollection = await mongoClient.db().collection('mediaLibraryItems');
  const documentsCollection = await mongoClient.db().collection('documents');
  const usersCollection = await mongoClient.db().collection('users');

  console.log(`Changing data structure on \n${JSON.stringify(sourceEnv)}\n`);

  const sourceS3 = createS3(sourceEnv);

  console.log(`Listing all objects from source: '${sourceEnv.s3BucketName}'`);
  const sourceObjects = await listAllObjects({ s3: sourceS3, bucketName: sourceEnv.s3BucketName });
  const objectsToMigrate = sourceObjects.filter(shouldMigrateObject);

  console.log(`Migrating ${objectsToMigrate.length} objects within S3 on '${sourceEnv.s3BucketName}'`);

  let errorOccurred = false;

  const migrateObject = async (obj, newObjectKey) => {
    await copyObjectWithinSameBucket({
      sourceS3,
      sourceBucketName: sourceEnv.s3BucketName,
      objectKey: obj.Key,
      newObjectKey
    });

    const documentId = getDocumentIdFromObjectKey(obj);
    const document = await documentsCollection.findOne({ _id: documentId });
    const authorUser = await usersCollection.findOne({ _id: document.createdBy });

    const portableUrl = `cdn://${newObjectKey}`;
    const fileName = newObjectKey.replace(CDN_MEDIA_LIBRARY_PREFIX, '');
    const resourceType = getResourceType(fileName);
    const contentType = getContentType(fileName);
    const tags = getResourceTags({ fileName, documentId });

    const newMediaLibraryItem = {
      _id: uniqueId.create(),
      resourceType,
      contentType,
      size: obj.Size,
      createdBy: authorUser._id,
      createdOn: obj.LastModified,
      updatedBy: authorUser._id,
      updatedOn: obj.LastModified,
      url: portableUrl,
      description: '',
      languages: [],
      licenses: [LICENCE],
      tags
    };

    await mediaLibraryItemsCollection.insertOne(newMediaLibraryItem);

    console.log(`Migrated '${obj.Key}' to '${newObjectKey}' and created media library item '${newMediaLibraryItem._id}'`);
  };

  const q = queue(async ({ obj }, callback) => {
    const newObjectKey = getNewObjectKey(obj);
    if (newObjectKey) {
      await migrateObject(obj, newObjectKey).then(() => callback?.(), err => callback?.(err));
    }
  }, OBJECT_MIGRATION_CONCURRENCY);

  q.error((err, { obj }) => {
    console.error(`Error while copying ${obj.key}`, err);
    errorOccurred = true;
    q.remove(() => true);
  });

  q.push(objectsToMigrate.map((obj, index) => ({ obj, index })));

  await q.drain();
  await mongoClient.close();

  if (errorOccurred) {
    console.error('CANCELLED BECAUSE OF ERRORS!');
  } else {
    console.log('SUCESSFULLY MIGRATED!');

    console.log(`Deleting old objects within S3 on '${sourceEnv.s3BucketName}'`);
    for (const obj of objectsToMigrate) {
      console.log(`Deleting object '${obj.Key}'`);
      await deleteObject(sourceS3, sourceEnv.s3BucketName, obj.Key);
    }
    console.log(`Deleted ${objectsToMigrate.length} objects within S3 on '${sourceEnv.s3BucketName}'`);

    console.log('SUCESSFULLY FINISHED!');
  }

})();
