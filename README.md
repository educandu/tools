# elmu-tools

Tools for elmu development and maintenance.

## Tools

1. `copy-data-from-prod-to-stag`
  Drops all staging data and replaces it with the current production data.
  Anonymizes all sensitive user information, replacing it with mock data.
2. `dump-stag`
  Creates a mongodump of the staging MongoDb database locally in `./tmp/dump/stag-elmu-web`
3. `dump-prod`
  Creates a mongodump of the production MongoDb database locally in `./tmp/dump/prod-elmu-web`


## Environment variables

| Variable | Description | Required by tools |
| --- | --- | --- |
| ELMU_S3_ENDPOINT | The S3 entrypoint <br />(e.g. 'https://s3.eu-central-1.amazonaws.com') | `copy-data-from-prod-to-stag` |
| ELMU_S3_REGION | The S3 region  <br />(e.g. 'eu-central-1') | `copy-data-from-prod-to-stag` |
| ELMU_S3_ACCESS_KEY | The S3 access key of the auth credentials | `copy-data-from-prod-to-stag` |
| ELMU_S3_SECRET_KEY | The S3 secret key of the auth credentials | `copy-data-from-prod-to-stag` |
| ELMU_DB_STAGING_URI | MongoDB URI for staging.  <br />(e.g. format: `mongodb+srv://[user]:[pass]@[host]/[name]`) | `copy-data-from-prod-to-stag`<br />`dump-stag` |
| ELMU_DB_STAGING_DB_NAME | MongoDB database name for staging | `copy-data-from-prod-to-stag`<br />`dump-stag` |
| ELMU_S3_STAGING_BUCKET_NAME | S3 bucket name for staging | `copy-data-from-prod-to-stag`<br />`dump-stag` |
| ELMU_DB_PRODUCTION_URI | MongoDB URI for production.  <br />(e.g format: `mongodb+srv://[user]:[pass]@[host]/[name]`) | `copy-data-from-prod-to-stag`<br />`dump-prod` |
| ELMU_DB_PRODUCTION_DB_NAME | MongoDB database name for production | `copy-data-from-prod-to-stag`<br />`dump-prod` |
| ELMU_S3_PRODUCTION_BUCKET_NAME | S3 bucket name for production | `copy-data-from-prod-to-stag`<br />`dump-prod` |

## License

ELMU is released under the MIT License. See the bundled LICENSE file for details.
