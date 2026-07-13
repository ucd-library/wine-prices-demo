import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Storage } from '@google-cloud/storage';
import config from '../config/index.js';

let storage = null;

/**
 * Lazily create the GCS client and return the configured bucket.
 * Uses application default credentials (GOOGLE_APPLICATION_CREDENTIALS or
 * workload identity).
 * @returns {import('@google-cloud/storage').Bucket}
 */
function getBucket() {
  if (!storage) storage = new Storage();
  return storage.bucket(config.storage.gcsBucket);
}

/**
 * Whether image reads are backed by a GCS bucket (GCS_BUCKET is set).
 * @returns {boolean}
 */
export function isGcsEnabled() {
  return Boolean(config.storage.gcsBucket);
}

/**
 * Normalize a stored image path to a subpath relative to the bucket root
 * or IMAGE_DIR. Legacy rows store absolute local paths
 * (e.g. /data/images/<shortArk>/<filename>) — reduce those to the trailing
 * <shortArk>/<filename> segments so they resolve under either backend,
 * regardless of the IMAGE_DIR the row was written with.
 * @param {string} imagePath - Value of pages.image_path
 * @returns {string} Subpath like "<shortArk>/<filename>"
 */
export function toSubpath(imagePath) {
  if (!path.isAbsolute(imagePath)) return imagePath;
  return imagePath.split(path.sep).filter(Boolean).slice(-2).join('/');
}

/**
 * Read a full image into memory from the configured backend.
 * @param {string} subpath - Path relative to the bucket root or IMAGE_DIR
 * @returns {Promise<Buffer>}
 */
export async function getImageBuffer(subpath) {
  if (isGcsEnabled()) {
    const [buf] = await getBucket().file(subpath).download();
    return buf;
  }
  return fsp.readFile(path.join(config.storage.imageDir, subpath));
}

/**
 * Check whether an image exists in the configured backend.
 * @param {string} subpath - Path relative to the bucket root or IMAGE_DIR
 * @returns {Promise<boolean>}
 */
export async function imageExists(subpath) {
  if (isGcsEnabled()) {
    const [exists] = await getBucket().file(subpath).exists();
    return exists;
  }
  try {
    await fsp.access(path.join(config.storage.imageDir, subpath));
    return true;
  } catch {
    return false;
  }
}

/**
 * Open a readable stream for an image from the configured backend.
 * @param {string} subpath - Path relative to the bucket root or IMAGE_DIR
 * @returns {import('node:stream').Readable}
 */
export function getImageStream(subpath) {
  if (isGcsEnabled()) {
    return getBucket().file(subpath).createReadStream();
  }
  return fs.createReadStream(path.join(config.storage.imageDir, subpath));
}
