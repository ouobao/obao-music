import { constants, createCipheriv, publicEncrypt, randomInt } from 'node:crypto';

const WEAPI_IV = '0102030405060708';
const WEAPI_PRESET_KEY = '0CoJUm6Qyw8W8jud';
const WEAPI_BASE62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const WEAPI_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB
-----END PUBLIC KEY-----`;
const WEAPI_SECRET_LENGTH = 16;
const WEAPI_RSA_BLOCK_BYTES = 128;

export interface NeteaseWeapiRequest {
  url: string;
  form: Record<string, string>;
}

export function createNeteaseWeapiRequest(
  apiUrl: string,
  data: Record<string, unknown>,
  secretKey = createSecretKey()
): NeteaseWeapiRequest {
  const url = new URL(apiUrl);
  if (!url.pathname.startsWith('/api/')) {
    throw new Error('网易云 weapi 请求地址无效');
  }

  url.pathname = `/weapi/${url.pathname.slice('/api/'.length)}`;
  return {
    url: url.toString(),
    form: createNeteaseWeapiForm(createNeteaseWeapiPayload(data), secretKey)
  };
}

export function createNeteaseWeapiPayload(data: Record<string, unknown>): Record<string, unknown> {
  return {
    ...data,
    e_r: false,
    csrf_token: data.csrf_token ?? ''
  };
}

export function createNeteaseWeapiForm(
  data: Record<string, unknown>,
  secretKey = createSecretKey()
): Record<string, string> {
  assertSecretKey(secretKey);
  const firstPass = aesEncrypt(JSON.stringify(data), WEAPI_PRESET_KEY);

  return {
    params: aesEncrypt(firstPass, secretKey),
    encSecKey: rsaEncryptSecret(secretKey)
  };
}

function aesEncrypt(text: string, key: string): string {
  const cipher = createCipheriv(
    'aes-128-cbc',
    Buffer.from(key, 'utf8'),
    Buffer.from(WEAPI_IV, 'utf8')
  );
  return Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]).toString('base64');
}

function rsaEncryptSecret(secretKey: string): string {
  const reversedSecret = Buffer.from([...secretKey].reverse().join(''), 'utf8');
  const input = Buffer.alloc(WEAPI_RSA_BLOCK_BYTES);
  reversedSecret.copy(input, input.length - reversedSecret.length);

  return publicEncrypt({
    key: WEAPI_PUBLIC_KEY,
    padding: constants.RSA_NO_PADDING
  }, input).toString('hex');
}

function createSecretKey(): string {
  return Array.from(
    { length: WEAPI_SECRET_LENGTH },
    () => WEAPI_BASE62[randomInt(WEAPI_BASE62.length)]
  ).join('');
}

function assertSecretKey(secretKey: string): void {
  if (secretKey.length !== WEAPI_SECRET_LENGTH || [...secretKey].some((character) => !WEAPI_BASE62.includes(character))) {
    throw new Error('网易云 weapi 密钥无效');
  }
}
