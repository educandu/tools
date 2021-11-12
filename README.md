# tools

Tools for educandu development and maintenance.

## Tools

1. `copy-data`
  Drops all destination data (mongoDB and S3) and replaces it with the source data.
  Anonymizes all sensitive user information, replacing it with mock data.
2. `dump-db`
  Creates a mongodump of the MongoDb database locally in `./tmp/dump/<nameOfDatabase>`

## Environment variables

| Variable | Description | Required by tools |
| --- | --- | --- |
| S3_ENDPOINT | The S3 entrypoint <br />(e.g. 'https://s3.eu-central-1.amazonaws.com') | `copy-data` |
| S3_REGION | The S3 region  <br />(e.g. 'eu-central-1') | `copy-data` |
| S3_ACCESS_KEY | The S3 access key of the auth credentials | `copy-data` |
| S3_SECRET_KEY | The S3 secret key of the auth credentials | `copy-data` |
| DB_URI_[ENV] | MongoDB URI for ENV.  <br />(e.g. format: `mongodb+srv://[user]:[pass]@[host]/[name]`) | `copy-data`<br />`dump-db` |
| DB_NAME_[ENV] | MongoDB database name for ENV | `copy-data`<br />`dump-db` |
| S3_BUCKET_NAME_[ENV] | S3 bucket name for ENV | `copy-data`<br />`dump-db` |

## Usage
### Running `copy-data`

Example for copying data from staging to integration:

export S3_ENDPOINT='https://s3.eu-central-1.amazonaws.com'
export S3_REGION='eu-central-1'
export S3_ACCESS_KEY='DSJHFDKSJFHERWUFRUKRF'
export S3_SECRET_KEY='DFLJKDSDFDS8FDF7DS/DSFLKFJDSLKFDJDJLF8+e'

export DB_URI_INT='mongodb+srv://user:fjdshf87dsV@int.mongodb.net/name'
export DB_NAME_INT='int.database'
export S3_BUCKET_NAME_INT='int.bucket.name'

export DB_URI_STAG='mongodb+srv://user:8798437432@stag.mongodb.net/name'
export DB_NAME_STAG='stag.database'
export S3_BUCKET_NAME_STAG='stag.bucket.name'

`$ ./copy-data -from STAG -to INT`

### Running `dump-db`

export DB_URI_INT='mongodb+srv://user:fjdshf87dsV@int.mongodb.net/name'
export DB_NAME_INT='int.database'

`$ ./dump-db -from INT`
## License

Educandu is released under the MIT License. See the bundled LICENSE file for details.
