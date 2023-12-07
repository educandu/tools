import { S3 } from '@aws-sdk/client-s3';
import promiseRetry from 'promise-retry';
import { PassThrough } from 'node:stream';
import { Upload } from '@aws-sdk/lib-storage';

function retryPromise(func, description = '', maxRetries = 5) {
  return promiseRetry((retry, attempt) => {
    if (attempt > 1 && description) {
      console.warn(`[${attempt}/${maxRetries}] ${description}`);
    }
    return func().catch(retry);
  }, { retries: maxRetries });
}

export function createS3({ s3Endpoint, s3Region, s3AccessKey, s3SecretKey }) {
  const credentials = {
    accessKeyId: s3AccessKey,
    secretAccessKey: s3SecretKey
  };

  return s3Endpoint.includes('amazonaws')
    ? new S3({
      apiVersion: '2006-03-01',
      endpoint: s3Endpoint,
      region: s3Region,
      credentials
    })
    : new S3({
      endpoint: s3Endpoint,
      region: s3Region,
      credentials,
      forcePathStyle: true,
      signatureVersion: 'v4'
    });
}

function listNext1000Objects(s3, bucketName, prefix, continuationToken) {
  const params = {
    Bucket: bucketName,
    MaxKeys: 1000,
    ContinuationToken: continuationToken
  };

  if (prefix) {
    params.Prefix = prefix;
  }

  return retryPromise(() => {
    return s3.listObjectsV2(params);
  }, `LIST prefix='${prefix}' continuationToken='${continuationToken}'`);
}

export async function listAllObjects({ s3, bucketName, prefix = null }) {
  let result = [];
  let continuationToken = null;

  do {
    const currentResult = await listNext1000Objects(s3, bucketName, prefix, continuationToken);
    if (currentResult.Contents?.length) {
      result = result.concat(currentResult.Contents);
      continuationToken = currentResult.NextContinuationToken || null;
    } else {
      continuationToken = null;
    }
  } while (continuationToken);

  return result;
}

export function deleteObject(s3, bucketName, objectKey) {
  const params = {
    Bucket: bucketName,
    Key: objectKey
  };

  return retryPromise(() => {
    return s3.deleteObject(params);
  }, `DELETE ${objectKey}`);
}

export async function deleteAllObjects(s3, bucketName) {
  const oldObjects = await listAllObjects({ s3, bucketName });
  for (const obj of oldObjects) {
    await deleteObject(s3, bucketName, obj.Key);
  }
}

function headObject({ s3, bucketName, objectKey }) {
  return retryPromise(() => {
    return s3.headObject({ Bucket: bucketName, Key: objectKey });
  }, `HEAD ${objectKey}`);
}

export function copyObjectWithinSameS3Account({ s3, sourceBucketName, destinationBucketName, objectKey }) {
  return retryPromise(() => {
    return s3.copyObject({
      Bucket: destinationBucketName,
      CopySource: `/${sourceBucketName}/${encodeURIComponent(objectKey)}`,
      Key: objectKey
    });
  }, `COPY ${objectKey}`);
}

export async function copyObjectBetweenDifferentS3Accounts({ sourceS3, destinationS3, sourceBucketName, destinationBucketName, objectKey }) {
  const { ContentType: contentType, Metadata: metadata } = await headObject({
    s3: sourceS3,
    bucketName: sourceBucketName,
    objectKey
  });

  return retryPromise(async () => {
    const stream = new PassThrough();

    const upload = new Upload({
      client: destinationS3,
      params: {
        Bucket: destinationBucketName,
        Key: objectKey,
        Body: stream,
        Metadata: metadata,
        ContentType: contentType
      },
      queueSize: 1,
      partSize: 10 * 1024 * 1024,
      leavePartsOnError: false
    });

    const res = await sourceS3.getObject({
      Bucket: sourceBucketName,
      Key: objectKey
    });

    res.Body.pipe(stream);
    return upload.done();
  }, `COPY ${objectKey}`);
}
