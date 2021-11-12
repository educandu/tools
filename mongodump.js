const del = require('del');
const path = require('path');
const execa = require('execa');
const mkdirp = require('mkdirp');
const { promisify } = require('util');

let mongoToolBuilt = false;
const CONTAINER_DUMP_DIR = '/mongodump';

function runCommand(cmd, args) {
  console.log([cmd, ...args].join(' '));
  return execa(cmd, args, { stdio: 'inherit' });
}

async function ensureMongoTools() {
  if (!mongoToolBuilt) {
    await runCommand('docker', ['build', '-t', 'mongotools', '.']);
    /* eslint-disable require-atomic-updates */
    mongoToolBuilt = true;
  }
}

async function getUserAndGroupId() {
  const { stdout: userId } = await execa('id', ['-u', process.env.USER]);
  const { stdout: groupId } = await execa('id', ['-g', process.env.USER]);
  return { userId, groupId };
}

async function dump({ uri, directory, db }) {
  await ensureMongoTools();

  const { userId, groupId } = await getUserAndGroupId();
  console.log(`Running with user ID ${userId} and group ID ${groupId}`);

  const localDumpDbDir = path.join(directory, db);

  console.log(`Purging directory ${localDumpDbDir}`);
  await del(localDumpDbDir);
  await promisify(mkdirp)(localDumpDbDir);

  const args = [
    'run',
    '--rm',
    '--user',
    `${userId}:${groupId}`,
    '-v',
    [directory, CONTAINER_DUMP_DIR].join(':'),
    'mongotools',
    'mongodump',
    '--uri',
    uri,
    '--out',
    CONTAINER_DUMP_DIR
  ];

  return runCommand('docker', args);
}

async function restore({ uri, directory, fromDb, toDb }) {
  await ensureMongoTools();

  const { userId, groupId } = await getUserAndGroupId();
  console.log(`Running with user ID ${userId} and group ID ${groupId}`);

  const containerRestoreDbDir = path.join(CONTAINER_DUMP_DIR, fromDb);

  const args = [
    'run',
    '--rm',
    '--user',
    `${userId}:${groupId}`,
    '-v',
    [directory, CONTAINER_DUMP_DIR].join(':'),
    'mongotools',
    'mongorestore',
    '--drop',
    '--uri',
    uri,
    '--db',
    toDb,
    '--nsFrom',
    fromDb,
    '--nsTo',
    toDb,
    containerRestoreDbDir
  ];

  return runCommand('docker', args);
}

module.exports = {
  dump,
  restore
};
