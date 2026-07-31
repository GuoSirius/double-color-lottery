// 同步脚本：把仓库根目录的 index.html 复制到 Capacitor 的 webDir（app/www/）。
// 前端只有这一份源文件，App / Web / Cloudflare 三端共用；改完前端只需重跑 `npm run sync`。
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const www = resolve(__dirname, 'www');

if (!existsSync(www)) mkdirSync(www, { recursive: true });
copyFileSync(resolve(root, 'index.html'), resolve(www, 'index.html'));
console.log('synced: root index.html -> app/www/index.html');
