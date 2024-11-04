import { ensureEnv } from './env-helper.js';
import { upsertItemById } from './mongo-helper.js';
import { createS3, headObject } from './s3-helper.js';
import { MongoClient, ServerApiVersion } from 'mongodb';

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
  const envArg = args.indexOf('-env');
  const env = args[envArg + 1];

  if (envArg === -1 || !env) {
    throw new Error('Expected arguments: -env \'environment\'');
  }

  const envConfig = ensureConfigForEnv(env);

  return {
    env: envConfig
  };
};

async function getPrivateStorageOverviewPerUser({ db, userId }) {
  const roomsCollection = db.collection('rooms');
  const roomMediaItemsCollection = db.collection('roomMediaItems');
  const documentInputMediaItemsCollection = db.collection('documentInputMediaItems');

  const rooms = await roomsCollection.find({ ownedBy: userId }).toArray();

  const mediaItemsPerRoom = await Promise.all(rooms.map(async room => {
    const roomMediaItems = await roomMediaItemsCollection.find({ roomId: room._id }).toArray();
    const documentInputMediaItems = await documentInputMediaItemsCollection.find({ roomId: room._id }).toArray();

    const usedBytesByRoomMediaItems = roomMediaItems.reduce((accu, item) => accu + item.size, 0);
    const usedBytesByDocumentInputMediaItems = documentInputMediaItems.reduce((accu, item) => accu + item.size, 0);

    return {
      totalUsedBytes: usedBytesByRoomMediaItems + usedBytesByDocumentInputMediaItems
    };
  }));

  const usedBytesInAllRooms = mediaItemsPerRoom.reduce((accu, { totalUsedBytes }) => accu + totalUsedBytes, 0);

  return {
    usedBytes: usedBytesInAllRooms
  };
}

(async () => {
  const { env } = getConfigFromParsingArguments();
  const mongoOptions = { serverApi: ServerApiVersion.v1 };
  const mongoClient = await MongoClient.connect(env.dbUri, mongoOptions);
  const db = await mongoClient.db();

  const s3 = createS3(env);
  const usersCollection = db.collection('users');
  const roomMediaItemsCollection = db.collection('roomMediaItems');
  const mediaLibraryItemsCollection = db.collection('mediaLibraryItems');
  const documentInputMediaItemsCollection = db.collection('documentInputMediaItems');

  const zeroSizeRoomMediaItems = await roomMediaItemsCollection.find({ size: 0 }).toArray();
  const zeroSizeMediaLibraryItems = await mediaLibraryItemsCollection.find({ size: 0 }).toArray();
  const zeroSizeDocumentInputMediaItems = await documentInputMediaItemsCollection.find({ size: 0 }).toArray();

  console.log(`Found ${zeroSizeRoomMediaItems.length} room media items to correct.`);
  console.log(`Found ${zeroSizeMediaLibraryItems.length} media library items to correct.`);
  console.log(`Found ${zeroSizeDocumentInputMediaItems.length} document input media items to correct.`);

  for (const roomMediaItem of zeroSizeRoomMediaItems) {
    const objectKey = roomMediaItem.url.replace('cdn://', '');
    const { ContentLength: size } = await headObject({ s3, bucketName: env.s3BucketName, objectKey });

    await upsertItemById(roomMediaItemsCollection, { ...roomMediaItem, size });

    console.log(`Rooms - Corrected ${objectKey} size to ${size}`);
  }

  for (const mediaLibraryItem of zeroSizeMediaLibraryItems) {
    const objectKey = mediaLibraryItem.url.replace('cdn://', '');
    const { ContentLength: size } = await headObject({ s3, bucketName: env.s3BucketName, objectKey });

    await upsertItemById(mediaLibraryItemsCollection, { ...mediaLibraryItem, size });

    console.log(`Media Library - Corrected ${objectKey} size to ${size}`);
  }

  for (const documentInputMediaItem of zeroSizeDocumentInputMediaItems) {
    const objectKey = documentInputMediaItem.url.replace('cdn://', '');
    const { ContentLength: size } = await headObject({ s3, bucketName: env.s3BucketName, objectKey });

    await upsertItemById(documentInputMediaItemsCollection, { ...documentInputMediaItem, size });

    console.log(`Document input - Corrected ${objectKey} size to ${size}`);
  }

  const usersWithStorage = await db.collection('users').find({ 'storage.planId': { $ne: null } }).toArray();
  console.log(`Found ${usersWithStorage.length} users with storage.`);

  for (const user of usersWithStorage) {
    const { usedBytes: actualUsedBytes } = await getPrivateStorageOverviewPerUser({ db, userId: user._id });
    if (user.storage.usedBytes !== actualUsedBytes) {
      console.log(`Correcting user ${user._id} (${user.displayName}) used bytes from ${user.storage.usedBytes} to ${actualUsedBytes}`);
      await upsertItemById(usersCollection, { ...user, storage: { ...user.storage, usedBytes: actualUsedBytes } });
    }
  }

  await mongoClient.close();
})();
