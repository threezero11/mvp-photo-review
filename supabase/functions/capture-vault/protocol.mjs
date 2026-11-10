export const MAX_BYTES=5*1024*1024;
export const PURPOSES=new Set(['general','trade','profile','work']);
export function validToken(token){return typeof token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(token);}
export function validId(id){return typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);}
export async function hash(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof bytes==='string'?new TextEncoder().encode(bytes):bytes)),x=>x.toString(16).padStart(2,'0')).join('');}
export function jpegDimensions(bytes){
 if(bytes.length<12||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw new Error('INVALID_JPEG');
 let p=2;
 while(p+4<bytes.length){if(bytes[p++]!==255)throw new Error('INVALID_JPEG');while(bytes[p]===255)p++;const marker=bytes[p++];if(marker===218||marker===217)break;if(marker===1||marker>=208&&marker<=215)continue;const length=bytes[p]*256+bytes[p+1];if(length<2||p+length>bytes.length)throw new Error('INVALID_JPEG');if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){if(length<8)break;const height=bytes[p+3]*256+bytes[p+4],width=bytes[p+5]*256+bytes[p+6];if(!width||!height||width>4096||height>4096)throw new Error('INVALID_DIMENSIONS');return{width,height};}p+=length;
 }throw new Error('INVALID_JPEG');
}
export function receipt(row){return{id:row.id,purpose:row.purpose,receivedAt:row.received_at,clientCapturedAt:row.client_captured_at,sha256:row.sha256,byteSize:row.byte_size,width:row.width,height:row.height,title:row.title||'촬영 기록',description:row.description||'',notesUpdatedAt:row.notes_updated_at,revoked:!!row.revoked_at,captureAssurance:'web-camera-flow-only',storageAssurance:'server-held-original'};}
