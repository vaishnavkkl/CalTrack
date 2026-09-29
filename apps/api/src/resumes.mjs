import path from 'node:path';

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export function decodeResume(upload) {
  const name = path.basename(String(upload?.name || '').replaceAll('\\', '/')).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 180);
  const extension = path.extname(name).toLowerCase();
  const types = { '.pdf': 'application/pdf', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  if (!types[extension]) throw Object.assign(new Error('Resume must be a PDF, DOC, or DOCX file.'), { status: 400 });
  const encoded = String(upload?.data || '');
  if (!encoded || encoded.length > Math.ceil(MAX_RESUME_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw Object.assign(new Error('Resume must be a valid file up to 5 MB.'), { status: 400 });
  }
  const data = Buffer.from(encoded, 'base64');
  const valid = extension === '.pdf' ? data.subarray(0, 5).toString() === '%PDF-'
    : extension === '.doc' ? data.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'))
      : data.subarray(0, 4).equals(Buffer.from('504b0304', 'hex'));
  if (!valid || !data.length || data.length > MAX_RESUME_BYTES) throw Object.assign(new Error('Resume contents do not match the selected file type, or exceed 5 MB.'), { status: 400 });
  return { name, extension, type: types[extension], data };
}
