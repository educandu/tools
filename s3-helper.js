function listNext1000Objects(s3, bucketName, continuationToken) {
  const params = {
    Bucket: bucketName,
    MaxKeys: 1000,
    ContinuationToken: continuationToken
  };

  return new Promise((resolve, reject) => {
    s3.listObjectsV2(params, (err, data) => err ? reject(err) : resolve(data));
  });
}

async function listAllObjects(s3, bucketName) {
  let result = [];
  let continuationToken = null;

  do {
    /* eslint-disable no-await-in-loop */
    const currentResult = await listNext1000Objects(s3, bucketName, continuationToken);
    if (currentResult.Contents.length) {
      result = result.concat(currentResult.Contents);
      continuationToken = currentResult.NextContinuationToken || null;
    } else {
      continuationToken = null;
    }
  } while (continuationToken);

  return result;
}

function deleteObject(s3, bucketName, key) {
  const params = {
    Bucket: bucketName,
    Key: key
  };

  return new Promise((resolve, reject) => {
    s3.deleteObject(params, (err, data) => err ? reject(err) : resolve(data));
  });
}

async function deleteAllObjects(s3, bucketName) {
  const oldObjects = await listAllObjects(s3, bucketName);
  for (const obj of oldObjects) {
    console.log(`Deleting object ${obj.Key}`);
    // eslint-disable-next-line no-await-in-loop
    await deleteObject(s3, bucketName, obj.Key);
  }
}

function copyObject(s3, sourceBucketName, sourceKey, destinationBucketName) {
  const params = {
    Bucket: destinationBucketName,
    CopySource: `/${sourceBucketName}/${encodeURIComponent(sourceKey)}`,
    Key: sourceKey
  };

  return new Promise((resolve, reject) => {
    s3.copyObject(params, (err, data) => err ? reject(err) : resolve(data));
  });
}

function updateObject({ s3, bucketName, key, metadata, contentType }) {
  const params = {
    Bucket: bucketName,
    Key: key,
    Metadata: metadata,
    ContentType: contentType
  };

  return new Promise((resolve, reject) => {
    s3.putObject(params, (err, s3Data) => err ? reject(err) : resolve(s3Data));
  });
}

module.exports = {
  listAllObjects,
  deleteObject,
  deleteAllObjects,
  copyObject,
  updateObject
};
