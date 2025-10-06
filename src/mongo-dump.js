import path from 'node:path';
import { execa } from 'execa';
import { mkdirp } from 'mkdirp';
import { deleteAsync } from 'del';
import { fileURLToPath } from 'node:url';

const CONTAINER_DUMP_DIR = '/mongodump';
const MONGO_TOOLS_IMAGE = 'educandu/mongotools:1.0.0';
const packageDirName = path.dirname(fileURLToPath(import.meta.url));
const packageParentDirName = path.dirname(packageDirName);

async function dockerRunOnceWithCurrentUser(args) {
  const { stdout: userId } = await execa('id', ['-u', process.env.USER]);
  const { stdout: groupId } = await execa('id', ['-g', process.env.USER]);

  const combinedArgs = ['run', '--rm', '--user', `${userId}:${groupId}`, ...args];

  console.log(`Running with user ID ${userId} and group ID ${groupId}:`);
  console.log(['docker', ...combinedArgs].join(' '));
  return execa('docker', combinedArgs, { stdio: 'inherit', cwd: packageParentDirName });
}

export async function dumpDb({ uri, directory, db }) {
  const localDumpDbDir = path.join(directory, db);

  console.log(`Purging directory ${localDumpDbDir}`);
  await deleteAsync(localDumpDbDir);
  await mkdirp(localDumpDbDir);

  return dockerRunOnceWithCurrentUser([
    '-v',
    [directory, CONTAINER_DUMP_DIR].join(':'),
    MONGO_TOOLS_IMAGE,
    'mongodump',
    '--uri',
    uri,
    '--out',
    CONTAINER_DUMP_DIR
  ]);
}

export function restoreDb({ uri, directory, fromDb, toDb }) {
  const containerRestoreDbDir = path.join(CONTAINER_DUMP_DIR, fromDb);

  return dockerRunOnceWithCurrentUser([
    '-v',
    [directory, CONTAINER_DUMP_DIR].join(':'),
    MONGO_TOOLS_IMAGE,
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
  ]);
}
