export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function ensure(condition, message, status = 400) {
  if (!condition) throw new HttpError(status, message);
}
export async function hash(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
}
export async function readBytes(request, limit) {
  ensure(Number(request.headers.get('content-length') || 0) <= limit, '文件超过大小限制', 413);
  const reader = request.body?.getReader();
  ensure(reader, '缺少请求内容');
  const parts = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.length;
      ensure(size <= limit, '文件超过大小限制', 413);
      parts.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}
export async function jsonBody(request, limit = 8192) {
  try { return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(await readBytes(request, limit))); }
  catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(400, 'JSON 格式错误'); }
}
export function metadata(input) {
  ensure(input && typeof input === 'object', '缺少适用信息');
  const result = {};
  for (const [key, max] of Object.entries({brand:50,model:80,hardware:40,mcu:60,firmware:60,note:1200})) {
    const value = typeof input[key] === 'string' ? input[key].trim() : '';
    ensure(value.length > 0 && value.length <= max && !/[\x00-\x08\x0b-\x1f]/.test(value), '请核对必填信息：' + key);
    result[key] = value;
  }
  ensure(input.shareConsent === true && input.experimentalConsent === true, '请阅读并确认公开分享与实验性功能说明');
  return result;
}
export async function validateHex(bytes) {
  ensure(bytes.length > 0 && bytes.length <= 12*1048576, 'HEX 大小无效');
  let text;
  try { text = new TextDecoder('utf-8', {fatal:true}).decode(bytes); }
  catch { throw new HttpError(400, 'HEX 必须为文本格式'); }
  const image = new Uint8Array(2*1048576);
  let upper = 0, next = 0x08000000, total = 0, eof = false;
  const lines = text.trim().split(/\r?\n/);
  ensure(lines.length <= 150000, 'HEX 记录过多');
  for (const raw of lines) {
    const line = raw.trim();
    ensure(!eof && /^:[0-9a-f]+$/i.test(line) && (line.length-1)%2 === 0, 'HEX 记录格式或 EOF 错误');
    const record = new Uint8Array((line.length-1)/2);
    for (let i=0;i<record.length;i++) record[i] = parseInt(line.slice(1+i*2,3+i*2),16);
    const count = record[0], address = record[1]*256+record[2], type=record[3];
    ensure(record.length === count+5 && record.reduce((a,b)=>a+b,0)%256===0, 'HEX 记录长度或校验和错误');
    if (type === 0) {
      ensure(count > 0 && address+count <= 65536 && upper+address === next, 'HEX 地址必须从内部 Flash 起点连续排列，不能缺失或重叠');
      ensure(total+count <= image.length, '当前最大支持 2 MiB 内部 Flash');
      image.set(record.subarray(4,4+count), total); total += count; next += count;
    } else if (type === 1) {
      ensure(count===0 && address===0, 'EOF 记录无效'); eof=true;
    } else if (type === 4) {
      ensure(count===2 && address===0, '扩展地址记录无效'); upper=(record[4]*256+record[5])*65536;
    } else if (type===5) {
      ensure(count===4 && address===0, '启动地址记录无效');
    } else { throw new HttpError(400, '当前仅接受本软件导出的线性地址 Intel HEX'); }
  }
  ensure(eof && [256,512,1024,2048].some(k=>k*1024===total), '备份长度异常，需为完整内部 Flash 导出');
  return {hexFileSha256:await hash(bytes), imageSha256:await hash(image.subarray(0,total)), decodedBytes:total, startAddress:'0x08000000'};
}
export function validateJpeg(bytes) {
  ensure(bytes.length >= 100 && bytes.length <= 1048576 && bytes[0]===255 && bytes[1]===216 && bytes.at(-2)===255 && bytes.at(-1)===217, '照片须为重编码后的 JPEG，单张不超过 1 MiB');
  let at=2, dimensions=null;
  while (at < bytes.length-2) {
    ensure(bytes[at++]===255, 'JPEG 标记无效');
    while (bytes[at]===255) at++;
    const marker=bytes[at++];
    if (marker===0xda) break;
    const length=bytes[at]*256+bytes[at+1];
    ensure(length>=2 && at+length<=bytes.length, 'JPEG 数据截断');
    ensure(marker!==0xe1 && marker!==0xfe, '照片包含 EXIF 或注释，请重新选择以去除元数据');
    if ([0xc0,0xc1,0xc2].includes(marker)) {
      dimensions={height:bytes[at+3]*256+bytes[at+4],width:bytes[at+5]*256+bytes[at+6]};
      ensure(dimensions.width>=160 && dimensions.height>=160 && dimensions.width<=1600 && dimensions.height<=1600, '照片尺寸须在 160–1600 像素之间');
    }
    at += length;
  }
  ensure(dimensions, '无法识别 JPEG 尺寸');
  return dimensions;
}
export function base64(bytes) {
  let s=''; for(let i=0;i<bytes.length;i+=8192) s+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(s);
}
