import {spawn} from 'node:child_process';

export const ffmpegPath = () => process.env.FFMPEG_PATH || 'ffmpeg';
export const ffprobePath = () => process.env.FFPROBE_PATH || 'ffprobe';

export const runProcess = (executable: string, args: string[]): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, args, {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
    const chunks: Buffer[] = [];
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-12000);
    });
    child.on('error', (error) => reject(new Error(`Could not run ${executable}. Check the installation and the PATH. ${error.message}`)));
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`${executable} exited with code ${code}.\n${stderr}`));
      else resolve(Buffer.concat(chunks));
    });
  });

/** Encoders and decoders the validators read alpha back with; the FFmpeg bundled with Remotion lacks them. */
export const missingCodecs = (encoders: string, decoders: string) => [
  ...['libvpx-vp9', 'prores_ks', 'gif'].filter((name) => !new RegExp(`\\b${name}\\b`).test(encoders)).map((name) => `encoder ${name}`),
  ...['libvpx-vp9', 'prores', 'gif', 'png'].filter((name) => !new RegExp(`\\b${name}\\b`).test(decoders)).map((name) => `decoder ${name}`),
];

/** Fails before any work when ffprobe is missing or ffmpeg cannot read every shipped format back. */
export const assertFullFfmpeg = async () => {
  await runProcess(ffprobePath(), ['-version']);
  const list = async (what: string) => (await runProcess(ffmpegPath(), ['-hide_banner', `-${what}`])).toString();
  const missing = missingCodecs(await list('encoders'), await list('decoders'));
  if (missing.length > 0) {
    throw new Error(`${ffmpegPath()} has no ${missing.join(', ')}. Use the full FFmpeg in /opt/homebrew/bin (set FFMPEG_PATH and FFPROBE_PATH).`);
  }
};
