import mkdirp from 'mkdirp';
import path from 'node:path';
import { execa } from 'execa';
import { deleteAsync } from 'del';
import { fileURLToPath } from 'node:url';

let mongoToolBuilt = false;
const CONTAINER_DUMP_DIR = '/mongodump';
const packageDirname = path.dirname(fileURLToPath(new URL(import.meta.url).href));

function runCommand(cmd, args) {
  console.log([cmd, ...args].join(' '));
  return execa(cmd, args, { stdio: 'inherit', cwd: packageDirname });
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

export async function dumpDb({ uri, directory, db }) {
  await ensureMongoTools();

  const { userId, groupId } = await getUserAndGroupId();
  console.log(`Running with user ID ${userId} and group ID ${groupId}`);

  const localDumpDbDir = path.join(directory, db);

  console.log(`Purging directory ${localDumpDbDir}`);
  await deleteAsync(localDumpDbDir);
  await mkdirp(localDumpDbDir);

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

export async function restoreDb({ uri, directory, fromDb, toDb }) {
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
