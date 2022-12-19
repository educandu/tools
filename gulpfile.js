import gulp from 'gulp';
import { deleteAsync } from 'del';
import { eslint, vitest } from '@educandu/dev-tools';

export async function clean() {
  await deleteAsync(['coverage', 'dump']);
}

export async function lint() {
  await eslint.lint('**/*.js', { failOnError: true });
}

export async function fix() {
  await eslint.fix('**/*.js');
}

export async function test() {
  await vitest.coverage();
}

export async function testWatch() {
  await vitest.watch();
}

export const build = done => done();

export const verify = gulp.series(lint, test, build);

export default verify;
