// services/s3Service.js
// Upgraded to AWS SDK v3 - modular and tree-shakeable for better performance
const { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

// Create S3 client with v3 configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.AWS_BUCKET_NAME;

// Build a clean S3 key with a logical prefix and timestamp.
// Using prefix directories keeps your bucket organized.
const buildS3Key = (prefix, fileName) => {
  const safePrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
  // Normalize filename to avoid spaces and problematic chars
  const baseName = fileName
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '');
  return `${safePrefix}${Date.now()}-${baseName}`;
};

// Optionally generate a public URL if your bucket/object ACL or CDN allows public access.
// If you use CloudFront, store that domain in env and swap the host here.
const getS3PublicUrl = (key) => {
  if (!BUCKET || !key) return null;
  // Note: this is a static URL. If your objects are private, prefer presigned URLs instead.
  return `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${encodeURI(key)}`;
};

const uploadToS3 = async (fileBuffer, fileName, mimetype, options = {}) => {
  const {
    keyPrefix = 'uploads/', // default bucket folder
    acl,                     // e.g., 'public-read' ONLY if you intend public access
    cacheControl,            // e.g., 'public, max-age=31536000, immutable' for static images
    contentDisposition,      // e.g., 'inline'
  } = options;

  const key = buildS3Key(keyPrefix, fileName);

  const params = {
    Bucket: BUCKET,
    Key: key,
    Body: fileBuffer,
    ContentType: mimetype,
  };

  // Optional params (SDK v3 style)
  if (acl) params.ACL = acl;
  if (cacheControl) params.CacheControl = cacheControl;
  if (contentDisposition) params.ContentDisposition = contentDisposition;

  // SDK v3: Use command pattern instead of .promise()
  const command = new PutObjectCommand(params);
  const data = await s3Client.send(command);

  // Return both key (for DB) and a URL (for immediate use in UI if appropriate)
  return {
    key: key,
    url: getS3PublicUrl(key),
    etag: data.ETag, // SDK v3 response format
  };
};

const getKeyFromUrl = (url) => {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    // decode URI component to handle spaces and special characters
    return decodeURIComponent(urlObj.pathname.substring(1)); // remove leading "/"
  } catch {
    return null;
  }
};

const deleteFromS3 = async (key) => {
  if (!key) return;
  const params = {
    Bucket: BUCKET,
    Key: key,
  };
  
  // SDK v3: Use command pattern
  const command = new DeleteObjectCommand(params);
  await s3Client.send(command);
};

const healthCheck = async () => {
  try {
    // SDK v3: Use command pattern to list objects
    const command = new ListObjectsV2Command({ 
      Bucket: BUCKET, 
      MaxKeys: 1 
    });
    await s3Client.send(command);
    return { status: 'healthy', message: 'S3 service is accessible' };
  } catch (error) {
    return { status: 'unhealthy', message: error.message };
  }
};

module.exports = {
  uploadToS3,
  deleteFromS3,
  healthCheck,
  getKeyFromUrl,
  getS3PublicUrl,
};
