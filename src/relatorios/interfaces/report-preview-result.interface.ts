import type { Readable } from 'node:stream';

export type ReportPreviewDisposition = 'inline';

export interface ReportPreviewResult {
  stream: Readable;
  filename: string;
  content_type: 'application/pdf';
  content_length: number | null;
  disposition: ReportPreviewDisposition;
}
