import mime from 'mime';
import { queue } from 'async';
import uniqueId from './unique-id.js';
import { ensureEnv } from './env-helper.js';
import { MongoClient, ServerApiVersion } from 'mongodb';
import { createS3, deleteObject, listAllObjects, copyObjectWithinSameBucket } from './s3-helper.js';

const OBJECT_MIGRATION_CONCURRENCY = 10;

const CDN_DOCUMENT_MEDIA_REGEX = /document-media\/(.+)\//;
const CDN_MEDIA_LIBRARY_PREFIX = 'media-library/';

const LICENCE = 'CC0-1.0';
const DEFAULT_TAG = 'generic';
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

const RESOURCE_TYPE = {
  none: 'none',
  unknown: 'unknown',
  audio: 'audio',
  video: 'video',
  image: 'image',
  pdf: 'pdf'
};

const resorceTypeByExtension = {
  '.jpg': RESOURCE_TYPE.image,
  '.jpeg': RESOURCE_TYPE.image,
  '.gif': RESOURCE_TYPE.image,
  '.png': RESOURCE_TYPE.image,
  '.tiff': RESOURCE_TYPE.image,
  '.raw': RESOURCE_TYPE.image,
  '.webp': RESOURCE_TYPE.image,
  '.svg': RESOURCE_TYPE.image,
  '.aac': RESOURCE_TYPE.audio,
  '.m4a': RESOURCE_TYPE.audio,
  '.mp3': RESOURCE_TYPE.audio,
  '.oga': RESOURCE_TYPE.audio,
  '.ogg': RESOURCE_TYPE.audio,
  '.wav': RESOURCE_TYPE.audio,
  '.flac': RESOURCE_TYPE.audio,
  '.mp4': RESOURCE_TYPE.video,
  '.m4v': RESOURCE_TYPE.video,
  '.ogv': RESOURCE_TYPE.video,
  '.webm': RESOURCE_TYPE.video,
  '.mpg': RESOURCE_TYPE.video,
  '.mpeg': RESOURCE_TYPE.video,
  '.mov': RESOURCE_TYPE.video,
  '.avi': RESOURCE_TYPE.video,
  '.mkv': RESOURCE_TYPE.video,
  '.pdf': RESOURCE_TYPE.pdf
};

const splitUrlAtExtension = url => {
  const sanitizedUrl = (url || '').trim();
  const matches = sanitizedUrl.match(/^(.*[^/])(\.[^./]+)$/i);
  return matches
    ? { baseName: matches[1], extension: matches[2] }
    : { baseName: sanitizedUrl, extension: '' };
};

const ensureConfigForEnv = env => {
  const sanitizedEnv = (env || '').trim().toUpperCase();

  return {
    dbUri: ensureEnv(`DB_URI_${sanitizedEnv}`),
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
    throw new Error('Expected arguments: -on \'environment\'');
  }

  const envConfig = ensureConfigForEnv(onEnv);

  return {
    sourceEnv: envConfig
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

const getResourceType = url => {
  const { extension } = splitUrlAtExtension(url);
  const lowercasedExtension = extension.toLowerCase();
  return extension
    ? resorceTypeByExtension[lowercasedExtension] || RESOURCE_TYPE.unknown
    : RESOURCE_TYPE.none;
};

const getResourceTags = ({ fileName, documentId }) => {
  const { baseName } = splitUrlAtExtension(fileName);
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
    const contentType = mime.getType(fileName) || DEFAULT_CONTENT_TYPE;
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

  const q = queue(({ obj }, callback) => {
    const newObjectKey = getNewObjectKey(obj);
    if (newObjectKey) {
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
