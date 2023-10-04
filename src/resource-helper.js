
import mime from 'mime';

const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

const RESOURCE_TYPE = {
  none: 'none',
  unknown: 'unknown',
  audio: 'audio',
  video: 'video',
  image: 'image',
  pdf: 'pdf'
};

const resorceTypeByExtension = {
  '.jpg': RESOURCE_TYPE.image,
  '.jpeg': RESOURCE_TYPE.image,
  '.gif': RESOURCE_TYPE.image,
  '.png': RESOURCE_TYPE.image,
  '.tiff': RESOURCE_TYPE.image,
  '.raw': RESOURCE_TYPE.image,
  '.webp': RESOURCE_TYPE.image,
  '.svg': RESOURCE_TYPE.image,
  '.aac': RESOURCE_TYPE.audio,
  '.m4a': RESOURCE_TYPE.audio,
  '.mp3': RESOURCE_TYPE.audio,
  '.oga': RESOURCE_TYPE.audio,
  '.ogg': RESOURCE_TYPE.audio,
  '.wav': RESOURCE_TYPE.audio,
  '.flac': RESOURCE_TYPE.audio,
  '.mp4': RESOURCE_TYPE.video,
  '.m4v': RESOURCE_TYPE.video,
  '.ogv': RESOURCE_TYPE.video,
  '.webm': RESOURCE_TYPE.video,
  '.mpg': RESOURCE_TYPE.video,
  '.mpeg': RESOURCE_TYPE.video,
  '.mov': RESOURCE_TYPE.video,
  '.avi': RESOURCE_TYPE.video,
  '.mkv': RESOURCE_TYPE.video,
  '.pdf': RESOURCE_TYPE.pdf
};

export function splitFileNameAtExtension(fileName) {
  const sanitizedUrl = (fileName || '').trim();
  const matches = sanitizedUrl.match(/^(.*[^/])(\.[^./]+)$/i);
  return matches
    ? { baseName: matches[1], extension: matches[2] }
    : { baseName: sanitizedUrl, extension: '' };
}

export function getResourceType(fileName) {
  const { extension } = splitFileNameAtExtension(fileName);
  const lowercasedExtension = extension.toLowerCase();
  return extension
    ? resorceTypeByExtension[lowercasedExtension] || RESOURCE_TYPE.unknown
    : RESOURCE_TYPE.none;
}

export function getContentType(fileName) {
  return mime.getType(fileName) || DEFAULT_CONTENT_TYPE;
}
