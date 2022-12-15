import anyBase from 'any-base';
import { v4 as uuidv4 } from 'uuid';

const flickrBase58 = '123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const hexToFlickrBase58 = anyBase(anyBase.HEX, flickrBase58);

export function createUniqueId() {
  return hexToFlickrBase58(uuidv4().replace(/-/g, ''));
}
