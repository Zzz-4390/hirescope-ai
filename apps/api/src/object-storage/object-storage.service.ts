export interface ObjectUpload {
  objectKey: string;
  content: Buffer;
  contentType: string;
}

export abstract class ObjectStorageService {
  abstract upload(input: ObjectUpload): Promise<void>;
  abstract delete(objectKey: string): Promise<void>;
  abstract createSignedReadUrl(objectKey: string): Promise<string>;
}
