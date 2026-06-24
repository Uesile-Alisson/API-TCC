import type { Readable } from 'node:stream';

export type ReportDownloadDisposition = 'attachment';

export interface ReportDownloadResult {
  stream: Readable;
  filename: string;
  content_type: string;
  content_length: number | null;
  disposition: ReportDownloadDisposition;
}
