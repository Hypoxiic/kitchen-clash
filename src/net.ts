import Peer, { type DataConnection } from 'peerjs';

// PeerJS's free cloud broker only introduces the two phones; game traffic
// then flows directly between them over WebRTC.
const PREFIX = 'kitchenclash-v1-';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';

function makeCode() {
  let code = '';
  for (let i = 0; i < 4; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return code;
}

function openPeer(id?: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id) : new Peer();
    peer.once('open', () => resolve(peer));
    peer.once('error', (err) => {
      peer.destroy();
      reject(err);
    });
  });
}

export async function hostRoom(): Promise<{ peer: Peer; code: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode();
    try {
      const peer = await openPeer(PREFIX + code);
      return { peer, code };
    } catch (err) {
      if ((err as { type?: string }).type !== 'unavailable-id') throw err;
    }
  }
  throw new Error('Could not create a room, try again.');
}

export async function joinRoom(code: string): Promise<{ peer: Peer; conn: DataConnection }> {
  const peer = await openPeer();
  return new Promise((resolve, reject) => {
    const conn = peer.connect(PREFIX + code.toUpperCase(), { reliable: true });
    const fail = (msg: string) => {
      peer.destroy();
      reject(new Error(msg));
    };
    const timer = setTimeout(() => fail('Could not reach that room.'), 10000);
    conn.once('open', () => {
      clearTimeout(timer);
      resolve({ peer, conn });
    });
    peer.once('error', (err) => {
      clearTimeout(timer);
      fail(err.type === 'peer-unavailable' ? `No room called ${code.toUpperCase()}.` : err.message);
    });
  });
}
