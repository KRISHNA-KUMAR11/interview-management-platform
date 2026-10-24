export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export function buildIceServers(env: {
  stunUrls?: string;
  turnUrls?: string;
  turnUsername?: string;
  turnPassword?: string;
}): IceServerConfig[] {
  const stun = splitList(env.stunUrls);
  const turn = splitList(env.turnUrls);
  const servers: IceServerConfig[] = [
    {
      urls: stun.length > 0 ? stun : ['stun:stun.l.google.com:19302'],
    },
  ];

  if (turn.length > 0 && env.turnUsername && env.turnPassword) {
    servers.push({
      urls: turn,
      username: env.turnUsername,
      credential: env.turnPassword,
    });
  }

  return servers;
}

function splitList(value?: string) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
