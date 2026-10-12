import insforge from '@/lib/insforge';

export interface FileValidationResult {
  valid: boolean;
  error: string | null;
}

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Validates file size, extension, and MIME type.
 */
export function validateProofDocument(file: File): FileValidationResult {
  if (!file) {
    return { valid: false, error: 'No file provided.' };
  }

  // 1. File size check
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File size (${sizeMb} MB) exceeds the maximum allowed limit of 5 MB.`,
    };
  }

  // 2. MIME type check
  if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
    return {
      valid: false,
      error: `Invalid file format (${file.type}). Allowed formats: PDF, JPEG, PNG.`,
    };
  }

  // 3. Extension check
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Invalid file extension (.${ext}). Allowed extensions: .pdf, .jpg, .jpeg, .png.`,
    };
  }

  return { valid: true, error: null };
}

export function generateProofObjectKey(studentId: string, filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || 'pdf';
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 9);
  const sanitizedFilename = filename
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 30);

  return `proofs/${studentId}/${timestamp}-${sanitizedFilename}-${randomSuffix}.${ext}`;
}

export const validateDocumentFile = validateProofDocument;

/**
 * Uploads student proof document to the private 'student-proofs' storage bucket.
 * Generates an isolated, collision-free object key.
 */
export async function uploadStudentProof(
  file: File,
  studentId: string
): Promise<{ key: string; error: string | null }> {
  const validation = validateProofDocument(file);
  if (!validation.valid) {
    return { key: '', error: validation.error };
  }

  const objectKey = generateProofObjectKey(studentId, file.name);

  try {
    const { data, error } = await insforge.storage
      .from('student-proofs')
      .upload(objectKey, file);

    if (error || !data) {
      return {
        key: '',
        error: error?.message || 'Storage upload failed. Please verify network and try again.',
      };
    }

    return { key: data.key, error: null };
  } catch (err: any) {
    return {
      key: '',
      error: err?.message || 'Unexpected exception during file upload to private vault.',
    };
  }
}

/**
 * Generates a time-limited signed URL or temporary blob URL for authenticated viewing.
 */
export async function getAuthorizedDocumentUrl(
  objectKey: string
): Promise<{ url: string | null; error: string | null }> {
  if (!objectKey) {
    return { url: null, error: 'Missing object key' };
  }

  try {
    // Try to create time-limited signed URL (valid for 1 hour)
    const { data, error } = await insforge.storage
      .from('student-proofs')
      .createSignedUrl(objectKey, 3600);

    if (data?.signedUrl) {
      return { url: data.signedUrl, error: null };
    }

    // Fallback: download as authenticated blob and create local ObjectURL
    const { data: blob, error: dlError } = await insforge.storage
      .from('student-proofs')
      .download(objectKey);

    if (dlError || !blob) {
      return {
        url: null,
        error: dlError?.message || error?.message || 'Failed to retrieve document from private vault.',
      };
    }

    const objectUrl = URL.createObjectURL(blob);
    return { url: objectUrl, error: null };
  } catch (err: any) {
    return {
      url: null,
      error: err?.message || 'Unable to generate authorized preview URL.',
    };
  }
}
