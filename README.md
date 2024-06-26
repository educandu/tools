# tools

[![codecov](https://codecov.io/gh/educandu/tools/branch/main/graph/badge.svg)](https://codecov.io/gh/educandu/tools)

Tools for educandu development and maintenance.

## Prerequisites

* node.js ^18.0.0
* Docker
* optional: globally installed gulp: `npm i -g gulp-cli`

This repository contains scripts for local usage, it does not create any build output.

## Available scripts

1. `copy-data`
  Drops all destination data (mongoDB and S3) and replaces it with the source data.
  Optionally anonymizes all sensitive user information, replacing it with mock data.
2. `dump-db`
  Creates a mongodump of the MongoDb database locally in `./dump/<nameOfDatabase>`
3. `prune-env`
  Drops all data (mongoDB and S3) from the specified environment

## Environment variables

| Variable | Description | Required by tools |
| --- | --- | --- |
| S3_ENDPOINT_[ENV] | The S3 entrypoint for ENV <br />(e.g. 'https://s3.eu-central-1.amazonaws.com') | `copy-data`<br />`prune-env` |
| S3_REGION_[ENV] | The S3 region for ENV  <br />(e.g. 'eu-central-1') | `copy-data`<br />`prune-env` |
| S3_ACCESS_KEY_[ENV] | The S3 access key of the auth credentials for ENV | `copy-data`<br />`prune-env` |
| S3_SECRET_KEY_[ENV] | The S3 secret key of the auth credentials for ENV | `copy-data`<br />`prune-env` |
| S3_BUCKET_NAME_[ENV] | S3 bucket name for ENV | `copy-data`<br />`dump-db`<br />`prune-env` |
| DB_URI_[ENV] | MongoDB URI for ENV.  <br />(e.g. format: `mongodb+srv://[user]:[pass]@[host]/[name]`) | `copy-data`<br />`dump-db`<br />`prune-env` |
| DB_NAME_[ENV] | MongoDB database name for ENV | `copy-data`<br />`dump-db`<br />`prune-env` |

## Usage
### Running `copy-data`

Example for copying data from staging to integration:

```
$ export DB_URI_INT='mongodb+srv://user:fjdshf87dsV@int.mongodb.net/name'
$ export DB_NAME_INT='int.database'
$ export S3_ENDPOINT_INT='https://s3.eu-central-1.amazonaws.com'
$ export S3_REGION_INT='eu-central-1'
$ export S3_ACCESS_KEY_INT='DSJHFDKSJFHERWUFRUKRF'
$ export S3_SECRET_KEY_INT='DFLJKDSDFDS8FDF7DS/DSFLKFJDSLKFDJDJLF8+e'
$ export S3_BUCKET_NAME_INT='int.bucket.name'

$ export DB_URI_STAG='mongodb+srv://user:8798437432@stag.mongodb.net/name'
$ export DB_NAME_STAG='stag.database'
$ export S3_ENDPOINT_STAG='https://s3.eu-central-1.amazonaws.com'
$ export S3_REGION_STAG='eu-central-1'
$ export S3_ACCESS_KEY_STAG='DSJHFDKSJFHERWUFRUKRF'
$ export S3_SECRET_KEY_STAG='DFLJKDSDFDS8FDF7DS/DSFLKFJDSLKFDJDJLF8+e'
$ export S3_BUCKET_NAME_STAG='stag.bucket.name'
```

`$ ./copy-data -from STAG -to INT -anonymize -skiplarge`

The `-anonymize` flag is optional and setting it will anonymize all users in the DB.
The `-skiplarge` flag is optional and setting it will skip copying CDN data larger than 2 Mb.

### Running `dump-db`

```
$ export DB_URI_INT='mongodb+srv://user:fjdshf87dsV@int.mongodb.net/name'
$ export DB_NAME_INT='int.database'
```

`$ ./dump-db -from INT`

### Running `prune-env`

Example for deleting all data from integration:

```
$ export DB_URI_INT='mongodb+srv://user:fjdshf87dsV@int.mongodb.net/name'
$ export DB_NAME_INT='int.database'
$ export S3_ENDPOINT_INT='https://s3.eu-central-1.amazonaws.com'
$ export S3_REGION_INT='eu-central-1'
$ export S3_ACCESS_KEY_INT='DSJHFDKSJFHERWUFRUKRF'
$ export S3_SECRET_KEY_INT='DFLJKDSDFDS8FDF7DS/DSFLKFJDSLKFDJDJLF8+e'
$ export S3_BUCKET_NAME_INT='int.bucket.name'
```

`$ ./prune-env -on INT`

---

## OER learning platform for music

Funded by 'Stiftung Innovation in der Hochschullehre'

<img src="https://stiftung-hochschullehre.de/wp-content/uploads/2020/07/logo_stiftung_hochschullehre_screenshot.jpg)" alt="Logo der Stiftung Innovation in der Hochschullehre" width="200"/>

A Project of the 'Hochschule für Musik und Theater München' (University for Music and Performing Arts)

<img src="https://upload.wikimedia.org/wikipedia/commons/d/d8/Logo_Hochschule_f%C3%BCr_Musik_und_Theater_M%C3%BCnchen_.png" alt="Logo der Hochschule für Musik und Theater München" width="200"/>

Project owner: Hochschule für Musik und Theater München\
Project management: Ulrich Kaiser
