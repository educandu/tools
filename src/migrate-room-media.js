import { queue } from 'async';
import uniqueId from './unique-id.js';
import { ensureEnv } from './env-helper.js';
import { MongoClient, ServerApiVersion } from 'mongodb';
import { createS3, listAllObjects } from './s3-helper.js';
import { getContentType, getResourceType } from './resource-helper.js';

const OBJECT_MIGRATION_CONCURRENCY = 20;

const CDN_ROOM_MEDIA_REGEX = /room-media\/(.+)\//;
const CDN_DIRMARKER_REGEX = /\/__DIRMARKER__$/;
const CDN_ROOM_MEDIA_PREFIX = 'room-media/';

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
  return !CDN_DIRMARKER_REGEX.test(obj.Key);
};

const getRoomIdFromObjectKey = obj => {
  const match = obj.Key.match(CDN_ROOM_MEDIA_REGEX);
  return match?.[1] || null;
};

(async () => {
  const { sourceEnv } = getConfigFromParsingArguments();
  console.log(`Migrating items on \n${JSON.stringify(sourceEnv)}\n`);

  const sourceS3 = createS3(sourceEnv);

  const mongoOptions = { useUnifiedTopology: true, serverApi: ServerApiVersion.v1 };
  const mongoClient = await MongoClient.connect(sourceEnv.dbUri, mongoOptions);

  const roomMediaItemCollection = mongoClient.db().collection('roomMediaItems');
  const roomCollection = mongoClient.db().collection('rooms');

  console.log('Fetching all rooms');
  const allRooms = await roomCollection.find({}, { projection: { _id: 1, ownedBy: 1 } }).toArray();
  const allRoomsById = new Map(allRooms.map(r => [r._id, r]));

  console.log(`Fetching relevant objects from source: '${sourceEnv.s3BucketName}'`);
  const sourceObjects = await listAllObjects({ s3: sourceS3, bucketName: sourceEnv.s3BucketName, prefix: CDN_ROOM_MEDIA_PREFIX });
  const objectsToMigrate = sourceObjects.filter(shouldMigrateObject);

  console.log(`Migrating ${objectsToMigrate.length} objects found on '${sourceEnv.s3BucketName}'`);

  const report = { errorOccurred: false, updatedItems: 0, insertedItems: 0 };

  const migrateObject = async obj => {
    const roomId = getRoomIdFromObjectKey(obj);
    const room = allRoomsById.get(roomId);
    if (!room) {
      console.error(`Could not find room with ID '${roomId}'`);
    }

    const newIdInCaseOfInsert = uniqueId.create();
    const fileName = obj.Key.replace(CDN_ROOM_MEDIA_PREFIX, '');
    const resourceType = getResourceType(fileName);
    const contentType = getContentType(fileName);

    const roomMediaItemFields = {
      roomId: room._id,
      resourceType,
      contentType,
      size: obj.Size,
      createdBy: room.ownedBy,
      createdOn: obj.LastModified,
      url: `cdn://${obj.Key}`
    };

    const updateFilter = { url: roomMediaItemFields.url };
    const updateSpec = { $set: roomMediaItemFields, $setOnInsert: { _id: newIdInCaseOfInsert } };
    const updateOptions = { upsert: true, returnDocument: 'after' };
    const { value } = await roomMediaItemCollection.findOneAndUpdate(updateFilter, updateSpec, updateOptions);

    if (value._id === newIdInCaseOfInsert) {
      report.insertedItems += 1;
      console.log(`Room media item for '${obj.Key}' (ID: '${roomMediaItemFields._id}') has been created`);
    } else {
      report.updatedItems += 1;
      console.log(`Room media item for '${obj.Key}' already existed`);
    }
  };

  const q = queue(async ({ obj }, callback) => {
    await migrateObject(obj).then(() => callback?.(), err => callback?.(err));
  }, OBJECT_MIGRATION_CONCURRENCY);

  q.error((err, { obj }) => {
    console.error(`Error while processing ${obj.Key}`, err);
    report.errorOccurred = true;
    q.remove(() => true);
  });

  q.push(objectsToMigrate.map((obj, index) => ({ obj, index })));

  await q.drain();
  await mongoClient.close();

  if (report.errorOccurred) {
    console.error('CANCELLED BECAUSE OF ERRORS!');
  } else {
    console.log(`${report.updatedItems} item(s) updated, ${report.insertedItems} item(s) inserted`);
    console.log('SUCESSFULLY FINISHED!');
  }

})();
