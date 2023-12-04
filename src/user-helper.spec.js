import { anonymizeUsers } from './user-helper.js';
import { beforeEach, describe, expect, it } from 'vitest';

describe('user-helper', () => {

  describe('anonymizeUsers', () => {
    let originalUser;
    let anonymizedUser;

    beforeEach(async () => {
      originalUser = {
        _id: '43o8tcqo874874wc44f',
        displayName: 'John Doe',
        passwordHash: '39tcmpgq93gp9wa4mztcwo8hfcsz83zrcamheig',
        email: 'johndoe@gmail.com',
        organization: 'Doe Ltd.',
        shortDescription: 'Hi, I am John!',
        profileOverview: 'I have been working as a worker for many years now..'
      };

      [anonymizedUser] = await anonymizeUsers([originalUser]);
    });

    it('does not anonymize the `_id`', () => {
      expect(anonymizedUser._id).toBe(originalUser._id);
    });

    it('anonymizes the `displayName`', () => {
      expect(anonymizedUser.displayName).not.toBe(originalUser.displayName);
    });

    it('anonymizes the `passwordHash`', () => {
      expect(anonymizedUser.passwordHash).not.toBe(originalUser.passwordHash);
    });

    it('anonymizes the `email`', () => {
      expect(anonymizedUser.email).not.toBe(originalUser.email);
    });

    it('anonymizes the `organization`', () => {
      expect(anonymizedUser.organization).not.toBe(originalUser.organization);
    });

    it('anonymizes the `shortDescription`', () => {
      expect(anonymizedUser.shortDescription).not.toBe(originalUser.shortDescription);
    });

    it('anonymizes the `profileOverview`', () => {
      expect(anonymizedUser.profileOverview).not.toBe(originalUser.profileOverview);
    });

  });

});
