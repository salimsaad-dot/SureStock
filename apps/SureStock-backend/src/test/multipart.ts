/** Hand-built multipart/form-data body for testing file-upload routes
 * via Fastify's `.inject()`, which needs a real body + matching
 * boundary header rather than a high-level multipart client. */
export function buildMultipartFile(
  fieldName: string,
  filename: string,
  contentType: string,
  content: Buffer,
): { body: Buffer; contentTypeHeader: string } {
  const boundary = `----surestocktest${Date.now()}`;
  const preamble = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
  );
  const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    body: Buffer.concat([preamble, content, epilogue]),
    contentTypeHeader: `multipart/form-data; boundary=${boundary}`,
  };
}
