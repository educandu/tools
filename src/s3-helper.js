import fs from 'node:fs';
import aws from 'aws-sdk';
import { PassThrough } from 'node:stream';

export function createS3({ s3Endpoint, s3Region, s3AccessKey, s3SecretKey }) {
  return s3Endpoint.includes('amazonaws')
    ? new aws.S3({
      apiVersion: '2006-03-01',
      endpoint: s3Endpoint,
      region: s3Region,
      credentials: new aws.Credentials(s3AccessKey, s3SecretKey)
    })
    : new aws.S3({
      endpoint: s3Endpoint,
      credentials: new aws.Credentials(s3AccessKey, s3SecretKey),
      s3ForcePathStyle: true,
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

  return new Promise((resolve, reject) => {
    s3.listObjectsV2(params, (err, data) => err ? reject(err) : resolve(data));
  });
}

export async function listAllObjects({ s3, bucketName, prefix = null }) {
  let result = [];
  let continuationToken = null;

  do {
    const currentResult = await listNext1000Objects(s3, bucketName, prefix, continuationToken);
    if (currentResult.Contents.length) {
      result = result.concat(currentResult.Contents);
      continuationToken = currentResult.NextContinuationToken || null;
    } else {
      continuationToken = null;
    }
  } while (continuationToken);

  return result;
}

export function deleteObject(s3, bucketName, key) {
  const params = {
    Bucket: bucketName,
    Key: key
  };

  return new Promise((resolve, reject) => {
    s3.deleteObject(params, (err, data) => err ? reject(err) : resolve(data));
  });
}

export async function deleteAllObjects(s3, bucketName) {
  const oldObjects = await listAllObjects({ s3, bucketName });
  for (const obj of oldObjects) {
    console.log(`Deleting object ${obj.Key}`);
    await deleteObject(s3, bucketName, obj.Key);
  }
}

function headObject({ s3, bucketName, objectKey }) {
  return new Promise((resolve, reject) => {
    s3.headObject({ Bucket: bucketName, Key: objectKey }, (err, data) => err ? reject(err) : resolve(data));
  });
}

export function copyObjectWithinSameS3Account({ s3, sourceBucketName, destinationBucketName, objectKey }) {
  return new Promise((resolve, reject) => {
    s3.copyObject({
      Bucket: destinationBucketName,
      CopySource: `/${sourceBucketName}/${encodeURIComponent(objectKey)}`,
      Key: objectKey
    }, (err, data) => err ? reject(err) : resolve(data));
  });
}

export async function copyObjectBetweenDifferentS3Accounts({ sourceS3, destinationS3, sourceBucketName, destinationBucketName, objectKey }) {
  const { ContentType: contentType, Metadata: metadata } = await headObject({
    s3: sourceS3,
    bucketName: sourceBucketName,
    objectKey
  });

  return new Promise((resolve, reject) => {
    const stream = new PassThrough();

    destinationS3.upload({
      Bucket: destinationBucketName,
      Key: objectKey,
      Body: stream,
      Metadata: metadata,
      ContentType: contentType
    }, (err, data) => err ? reject(err) : resolve(data));

    sourceS3.getObject({
      Bucket: sourceBucketName,
      Key: objectKey
    }).createReadStream().pipe(stream);
  });
}

export async function changeObjectKey({ sourceS3, sourceBucketName, objectKey, newObjectKey }) {
  const { ContentType: contentType, Metadata: metadata } = await headObject({
    s3: sourceS3,
    bucketName: sourceBucketName,
    objectKey: objectKey
  });

  return new Promise((resolve, reject) => {
    const stream = new PassThrough();

    sourceS3.upload({
      Bucket: sourceBucketName,
      Key: newObjectKey,
      Body: stream,
      Metadata: metadata,
      ContentType: contentType
    }, (err, data) => err ? reject(err) : resolve(data));

    sourceS3.getObject({
      Bucket: sourceBucketName,
      Key: objectKey
    }).createReadStream().pipe(stream);
  });
}

export function downloadObject({ sourceS3, sourceBucketName, objectKey }, downDir) {
  const stream = fs.createWriteStream(downDir);

  return new Promise((resolve, reject) => {
    sourceS3.getObject({
      Bucket: sourceBucketName,
      Key: objectKey
    }, (err, data) => err ? reject(err) : resolve(data))
      .createReadStream()
      .pipe(stream);
  });
}

export function updateObject({ s3, bucketName, key, metadata, contentType }) {
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
