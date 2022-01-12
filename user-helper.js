const Chance = require('chance');
const bcrypt = require('bcrypt');
const uniqueId = require('./unique-id');

const PASSWORD_SALT_ROUNDS = 1024;
const chance = new Chance();

async function createAdminUser() {
  return {
    _id: uniqueId.create(),
    provider: 'educandu',
    username: 'test',
    passwordHash: await bcrypt.hash('test', PASSWORD_SALT_ROUNDS),
    email: 'test@test.com',
    roles: ['user', 'admin'],
    expires: null,
    verificationCode: null,
    lockedOut: false,
    profile: null
  };
}

async function anonymizeUser(user) {
  const password = uniqueId.create();

  return {
    ...user,
    username: `${chance.first().toLowerCase()}${chance.last().toLowerCase()}${chance.integer({ min: 0, max: 100 })}`,
    passwordHash: await bcrypt.hash(password, PASSWORD_SALT_ROUNDS),
    email: chance.email({ domain: 'test.com' }),
    profile: {
      firstName: chance.first(),
      lastName: chance.last(),
      street: chance.street(),
      streetSupplement: '',
      postalCode: chance.zip(),
      city: chance.city(),
      country: chance.country()
    }
  };
}

function anonymizeUsers(users) {
  return Promise.all([createAdminUser(), ...users.map(anonymizeUser)]);
}

module.exports = {
  anonymizeUsers
};
