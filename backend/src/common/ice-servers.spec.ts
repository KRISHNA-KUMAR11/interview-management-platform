import { buildIceServers } from './ice-servers';

describe('buildIceServers', () => {
  it('keeps a public STUN server when nothing is configured', () => {
    expect(buildIceServers({})).toEqual([
      { urls: ['stun:stun.l.google.com:19302'] },
    ]);
  });

  it('adds the TURN relay when credentials are present', () => {
    expect(
      buildIceServers({
        stunUrls: 'stun:127.0.0.1:3478',
        turnUrls: 'turn:127.0.0.1:3478?transport=udp, turn:127.0.0.1:3478?transport=tcp',
        turnUsername: 'interview',
        turnPassword: 'interview-turn',
      }),
    ).toEqual([
      { urls: ['stun:127.0.0.1:3478'] },
      {
        urls: [
          'turn:127.0.0.1:3478?transport=udp',
          'turn:127.0.0.1:3478?transport=tcp',
        ],
        username: 'interview',
        credential: 'interview-turn',
      },
    ]);
  });

  it('skips TURN when the password is missing', () => {
    const servers = buildIceServers({
      turnUrls: 'turn:127.0.0.1:3478',
      turnUsername: 'interview',
    });
    expect(servers).toHaveLength(1);
  });
});
