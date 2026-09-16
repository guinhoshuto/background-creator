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
    child.on('error', (error) => reject(new Error(`Não foi possível executar ${executable}. Verifique a instalação e o PATH. ${error.message}`)));
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`${executable} terminou com código ${code}.\n${stderr}`));
      else resolve(Buffer.concat(chunks));
    });
  });
