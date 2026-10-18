import SparkMD5 from 'spark-md5';

/** 计算单个 Blob（分片）的 MD5 */
export function hashBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(SparkMD5.ArrayBuffer.hash(reader.result as ArrayBuffer));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('计算分片 MD5 失败'));
      }
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsArrayBuffer(blob);
  });
}

const HASH_CHUNK_SIZE = 2 * 1024 * 1024;

/** 流式计算整个文件的 MD5（spark-md5），onProgress 返回 0-100 */
export async function hashFile(file: File, onProgress?: (percent: number) => void): Promise<string> {
  const spark = new SparkMD5.ArrayBuffer();
  let offset = 0;
  while (offset < file.size) {
    const slice = file.slice(offset, offset + HASH_CHUNK_SIZE);
    const buf = await slice.arrayBuffer();
    spark.append(buf);
    offset += HASH_CHUNK_SIZE;
    onProgress?.(Math.min(100, Math.round((offset / file.size) * 100)));
  }
  return spark.end();
}
