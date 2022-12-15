export function ensureEnv(name) {
  const result = process.env[name];
  if (!result) {
    throw new Error(`Environment variable ${name} is missing or empty!`);
  }

  return result;
}
