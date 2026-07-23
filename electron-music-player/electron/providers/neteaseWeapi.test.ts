import { describe, expect, it } from 'vitest';
import { createNeteaseWeapiPayload, createNeteaseWeapiRequest } from './neteaseWeapi.cts';

describe('netease weapi request', () => {
  it('matches the NeteaseCloudMusicApi 4.32.0 wire contract for a fixed secret', () => {
    const request = createNeteaseWeapiRequest(
      'https://music.163.com/api/v1/discovery/simiSong',
      {
        songid: '42',
        limit: '50',
        offset: '0',
        e_r: false,
        csrf_token: ''
      },
      'abcdefghijklmnop'
    );

    expect(request).toEqual({
      url: 'https://music.163.com/weapi/v1/discovery/simiSong',
      form: {
        params: '2BJwXTJpOxCAQ3o55C0JJTuic7V4cPCe9iagJ2Lpg3udW+dZ+FdXdG469zVAmiDL2kBrU+75RxIVS9OtC2zlWBLcimAv9obKMOm5A3kih0987tIdu6Bw8pwa8WE4DH0rV2eDwjhLsYmQ2e5JBk5e9A==',
        encSecKey: 'd15a1683c992095d0c234c19966605c5c5964911268bbeda8cb8d08d834913e59d53b32358903a121b5fca784c1f5ae44951fd02524df58ecc98e52cc7cf8689b42c2e93ddf05b0592512d87f5960467e2f086c018849d76014d323500e30f13ef4cafbb0cf5a66731a3f1776c75ca35d0062dac70a3e33245afabcf47938487'
      }
    });
  });

  it('rejects non-api paths before encrypting a request', () => {
    expect(() => createNeteaseWeapiRequest(
      'https://music.163.com/eapi/v1/discovery/simiSong',
      {},
      'abcdefghijklmnop'
    )).toThrow('网易云 weapi 请求地址无效');
  });

  it('preserves the authenticated csrf token in the encrypted payload envelope', () => {
    expect(createNeteaseWeapiPayload({
      alg: 'itembased',
      trackId: '42',
      like: true,
      csrf_token: 'csrf-token'
    })).toEqual({
      alg: 'itembased',
      trackId: '42',
      like: true,
      e_r: false,
      csrf_token: 'csrf-token'
    });
  });
});
