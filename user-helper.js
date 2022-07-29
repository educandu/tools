const Chance = require('chance');
const bcrypt = require('bcrypt');
const uniqueId = require('./unique-id');

const PASSWORD_SALT_ROUNDS = 1024;
const chance = new Chance();

async function anonymizeUsers(users) {
  const anonymizedUsers = [];
  const consumedUserDataKeys = new Set();

  for (const user of users) {
    const password = uniqueId.create();

    let userData;
    let userDataKey;

    do {
      userData = {
        first: chance.first().toLowerCase(),
        last: chance.last().toLowerCase(),
        random: chance.integer({ min: 0, max: 100 })
      };
      userDataKey = Object.values(userData).join();
    } while (consumedUserDataKeys.has(userDataKey));

    consumedUserDataKeys.add(userDataKey);

    anonymizedUsers.push({
      ...user,
      displayName: `${userData.first}${userData.last}${userData.random}`,
      // eslint-disable-next-line no-await-in-loop
      passwordHash: await bcrypt.hash(password, PASSWORD_SALT_ROUNDS),
      email: `${userData.first}${userData.last}${userData.random}@test.com`,
      organization: chance.company(),
      introduction: chance.paragraph({ sentences: 5 })
    });
  }

  return anonymizedUsers;
}

module.exports = {
  anonymizeUsers
};
