const faker = require('faker');
const bcrypt = require('bcrypt');
const uniqueId = require('./unique-id');

const PROVIDER_NAME = 'educandu';
const PASSWORD_SALT_ROUNDS = 1024;

async function createAdminUser() {
  return {
    _id: uniqueId.create(),
    provider: PROVIDER_NAME,
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
  const password = faker.internet.password();
  return {
    ...user,
    username: faker.internet.userName(),
    passwordHash: await bcrypt.hash(password, PASSWORD_SALT_ROUNDS),
    email: faker.internet.email(null, null, 'test.com'),
    profile: {
      firstName: faker.name.firstName(),
      lastName: faker.name.lastName(),
      street: faker.address.streetAddress(),
      streetSupplement: '',
      postalCode: faker.address.zipCode(),
      city: faker.address.cityName(),
      country: faker.address.countryCode()
    }
  };
}

function anonymizeUsers(users) {
  return Promise.all([createAdminUser(), ...users.map(anonymizeUser)]);
}

module.exports = {
  anonymizeUsers
};
