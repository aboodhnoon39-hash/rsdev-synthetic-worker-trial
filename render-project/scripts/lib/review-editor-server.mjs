import {createUnsplashConnector} from '../dev-app/unsplash-connector.mjs';
import {createCommonsVideos} from '../dev-app/commons-videos.mjs';
import {createTestHistory} from '../dev-app/tool-test-history.mjs';
import {recordStockCatalog} from '../dev-app/workflow-assets.mjs';
import {readSavedTracking} from '../dev-app/saved-tracking.mjs';
import {importOpenverseImage} from '../dev-app/openverse-import.mjs';
import {ROOT} from './project-paths.mjs';
import {createNativeRenderJobs} from './review-native-render-jobs.mjs';
import {importMediaAsset,importMediaStream} from './review-media-assets.mjs';
import './project-tmp.mjs';
import http from 'node:http';
import path from 'node:path';
import { createReadStream, promises as fs } from 'node:fs';
import { pipeline } from 'node:stream';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { buildReviewApp } from './review-editor-build.mjs';
import { loadReviewProject, resolveManifestPath, PUBLIC_DIR } from './review-editor-project.mjs';
import { createJobManager, createManifestStore, HttpError } from './review-editor-jobs.mjs';
import { validateManifest } from '../../engine/src/review-editor/validate.ts';
import { TOKEN_HEADER } from '../../engine/src/review-editor/types.ts';

export { HttpError };

const MAX_BODY = 10 * 1024 * 1024;
const MIME = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.lottie': 'application/json',
};

export const randomToken = () => randomBytes(16).toString('hex');

function sendJson(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': data.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(data);
}

async function readBody(req) {
  const declared = Number(req.headers['content-length']);
  if (declared > MAX_BODY) throw new HttpError(413, 'request body is too large');
  const type = String(req.headers['content-type'] ?? '');


  const bodiless = req.headers['transfer-encoding'] === undefined && (req.headers['content-length'] === undefined || declared === 0);
  if (!type && bodiless) { req.resume(); return {}; }
  if (!/^application\/json\b/i.test(type)) throw new HttpError(415, 'POST bodies must be application/json');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'request body is too large');
    chunks.push(chunk);
  }
  try { return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; } catch { throw new HttpError(400, 'invalid JSON body'); }
}









export async function resolvePublicFile(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  // eslint-disable-next-line no-control-regex -- refusing control characters is the point
  if (/[\\:\x00-\x1f]/.test(decoded) || !decoded.startsWith('/')) return null;
  const parts = decoded.slice(1).split('/');
  if (!parts.length || parts.some((p) => !p || p === '.' || p === '..' || p.startsWith('.'))) return null;
  const abs = path.join(PUBLIC_DIR, ...parts);
  if (!abs.startsWith(PUBLIC_DIR + path.sep)) return null;
  const real = await fs.realpath(abs).catch(() => null);
  const realRoot = await fs.realpath(PUBLIC_DIR).catch(() => null);
  if (!real || !realRoot || !real.startsWith(realRoot + path.sep)) return null;
  const stat = await fs.stat(real).catch(() => null);
  return stat?.isFile() ? { file: real, stat } : null;
}


async function servePublic(req, res, urlPath) {
  const hit = await resolvePublicFile(urlPath);
  if (!hit) return false;
  const { file, stat } = hit;
  const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  const base = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'no-cache', 'last-modified': stat.mtime.toUTCString(), 'x-content-type-options': 'nosniff' };
  if (req.headers['if-modified-since'] && !req.headers.range && new Date(req.headers['if-modified-since']) >= new Date(Math.floor(stat.mtimeMs / 1000) * 1000)) {
    res.writeHead(304, base); res.end(); return true;
  }
  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? '').trim());
  if (range && (range[1] || range[2])) {
    if (range[1]) { start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1; }
    else { start = Math.max(0, stat.size - Number(range[2])); }
    if (start > end || start >= stat.size) { res.writeHead(416, { ...base, 'content-range': `bytes */${stat.size}` }); res.end(); return true; }
    status = 206;
  }
  res.writeHead(status, { ...base, 'content-length': end - start + 1, ...(status === 206 ? { 'content-range': `bytes ${start}-${end}/${stat.size}` } : {}) });
  if (req.method === 'HEAD' || stat.size === 0) { res.end(); return true; }

  pipeline(createReadStream(file, { start, end }), res, () => {});
  return true;
}









export function apiHandlers() {
  return {
    'GET /api/tracking': async({ctx})=>{const manifest=JSON.parse(await fs.readFile(path.resolve(ROOT,ctx.manifestPath),'utf8')),result=await readSavedTracking(manifest);if(!result)throw new HttpError(404,'لا تتبع محفوظ مطابق لهذا المصدر؛ لا تحليل تلقائي.');return {result};},
    'GET /api/project': ({ ctx }) => loadReviewProject(ctx.manifestPath),
    'POST /api/media/upload': ({req,url,ctx})=>importMediaStream(ctx.manifestPath,url.searchParams.get('name'),req,{size:Number(req.headers['content-length'])||undefined}),
    'POST /api/unsplash/search': ({body,ctx})=>ctx.unsplash.search(body.query,{approved:body.approved===true,cachedOnly:body.cachedOnly!==false}),
    'POST /api/commons/search': ({body,ctx})=>ctx.commons.search(body.query,{approved:body.approved===true,cachedOnly:body.cachedOnly!==false}),
    'POST /api/commons/import': async({body,ctx})=>{const imported=await ctx.commons.importVideo(body.id,{manifestPath:ctx.manifestPath,approved:body.approved===true,cachedOnly:body.cachedOnly!==false});const manifest=JSON.parse(await fs.readFile(path.resolve(ROOT,ctx.manifestPath),'utf8'));manifest.nativeEditor??={assets:[]};manifest.nativeEditor.assets=[...(manifest.nativeEditor.assets??[]),imported.asset];await recordStockCatalog(ROOT,manifest,imported.asset,imported.provenance,async(f,d)=>{const t=f+'.tmp';await fs.writeFile(t,JSON.stringify(d,null,2));await fs.rename(t,f);});return imported;},
    'POST /api/unsplash/import': async({body,ctx})=>{const imported=await ctx.unsplash.importPhoto(body.photo,{manifestPath:ctx.manifestPath,approved:body.approved===true,cachedOnly:body.cachedOnly!==false});const manifest=JSON.parse(await fs.readFile(path.resolve(ROOT,ctx.manifestPath),'utf8'));manifest.nativeEditor??={assets:[]};manifest.nativeEditor.assets=[...(manifest.nativeEditor.assets??[]),imported.asset];await recordStockCatalog(ROOT,manifest,imported.asset,imported.provenance,async(f,d)=>{const t=f+'.tmp';await fs.writeFile(t,JSON.stringify(d,null,2));await fs.rename(t,f);});return imported;},
    'POST /api/openverse/import': ({body,ctx})=>importOpenverseImage(ctx.manifestPath,body.id,{approved:body.approved===true,licenseReviewed:body.licenseReviewed===true,historyFolder:ctx.toolHistoryFolder}),
    'POST /api/media/import': ({body,ctx}) => importMediaAsset(ctx.manifestPath,body),
    'POST /api/native-render': ({body,ctx})=>ctx.nativeJobs.start(body?.seconds===null?null:body?.seconds??3,body?.manifest),
    'GET /api/native-render': ({ctx})=>ctx.nativeJobs.snapshot(),
    'GET /api/native-render/file': async({ctx,res,url})=>{if(url.searchParams.has('job')&&url.searchParams.get('job')!==ctx.nativeJobs.snapshot().id)throw new HttpError(409,'تغير الرندر؛ حدّث رابط النتيجة.');const file=ctx.nativeJobs.file();if(!file)throw new HttpError(404,'المعاينة لم تكتمل.');const stat=await fs.stat(file);res.writeHead(200,{'content-type':'video/mp4','content-length':stat.size,'cache-control':'no-store'});createReadStream(file).pipe(res);},
    'POST /api/validate': ({ body }) => validateManifest(body?.manifest),
    'POST /api/save': ({ body, ctx }) => ctx.store.save(body),
    'GET /api/history': ({ ctx }) => ctx.store.history(),
    'POST /api/restore': ({ body, ctx }) => ctx.store.restore(body),
    'POST /api/prepare': ({ ctx }) => ctx.jobs.start('prepare'),
    'POST /api/export': ({ body, ctx }) => ctx.jobs.start('export', body?.mode),
    'GET /api/jobs/:id/events': ({ req, res, params, ctx }) => ctx.jobs.stream(params.id, req, res),
    'POST /api/jobs/:id/cancel': ({ params, ctx }) => ctx.jobs.cancel(params.id),
    'GET /api/disk': ({ url, ctx }) => ctx.jobs.disk(url.searchParams.get('mode')),
  };
}

function matchRoute(handlers, method, pathname) {
  const direct = handlers[`${method} ${pathname}`];
  if (direct) return { handler: direct, params: {} };
  for (const [key, handler] of Object.entries(handlers)) {
    const [m, pattern] = key.split(' ');
    if (m !== method || !pattern.includes(':')) continue;
    const names = [];
    const rx = new RegExp(`^${pattern.replace(/:([a-z]+)/gi, (_, n) => (names.push(n), '([A-Za-z0-9_-]{1,80})'))}$`);
    const hit = rx.exec(pathname);
    if (hit) return { handler, params: Object.fromEntries(names.map((n, i) => [n, hit[i + 1]])) };
  }
  return null;
}

const sameToken = (given, expected) => {
  const a = Buffer.from(String(given ?? ''));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};








export async function createReviewServer({ manifestPath, port = 0, token = randomToken(), dev = false, bundle, log = () => {}, deps = {}, toolHistoryFolder }) {
  const rel = resolveManifestPath(manifestPath);
  await loadReviewProject(rel);
  const built = bundle ?? (await buildReviewApp({ dev }));
  const jobs = createJobManager({ manifestPath: rel, log, ...deps });
  const nativeJobs=createNativeRenderJobs(rel);
  const store = createManifestStore({ manifestPath: rel, isBusy: ()=>jobs.busy()||nativeJobs.busy(), ...(deps.now ? { now: deps.now } : {}) });
  const connectorFolder=toolHistoryFolder??path.join(ROOT,'state/dev-app/tools');const receipts=createTestHistory(connectorFolder,{environment:{origin:'runtime'}});const unsplash=createUnsplashConnector({root:ROOT,folder:connectorFolder,receipt:receipts.append});
  const commons=createCommonsVideos({root:ROOT,folder:connectorFolder,receipt:receipts.append});
  const ctx = { manifestPath: rel, token, store, jobs,nativeJobs,toolHistoryFolder,unsplash,commons };
  const handlers = apiHandlers();
  let actualPort = port;

  const server = http.createServer(async (req, res) => {
    try {
      const host = String(req.headers.host ?? '');
      if (!new RegExp(`^(127\\.0\\.0\\.1|localhost|\\[::1\\]):${actualPort}$`).test(host)) throw new HttpError(421, 'bad Host header');

      if (!/^\/(?!\/)/.test(req.url ?? '')) throw new HttpError(400, 'bad request path');
      const url = new URL(req.url, `http://127.0.0.1:${actualPort}`);
      const method = req.method ?? 'GET';
      if (url.pathname.startsWith('/api/')) {
        if (!sameToken(req.headers[TOKEN_HEADER] ?? url.searchParams.get('token'), token)) throw new HttpError(401, 'missing or wrong token');

        const origin = req.headers.origin;
        if (method === 'POST' && origin !== undefined && !new RegExp(`^http://(127\\.0\\.0\\.1|localhost|\\[::1\\]):${actualPort}$`).test(String(origin))) {
          throw new HttpError(403, 'bad Origin: this editor only accepts requests from its own page');
        }
        const route = matchRoute(handlers, method, url.pathname);
        if (!route) throw new HttpError(404, 'unknown endpoint');
        const body = method === 'POST' && url.pathname!=='/api/media/upload' ? await readBody(req) : undefined;
        const result = await route.handler({ req, res, url, body, params: route.params, ctx });
        if (result !== undefined && !res.headersSent) sendJson(res, 200, result);
        return;
      }
      if (method !== 'GET' && method !== 'HEAD') throw new HttpError(405, 'read-only');
      const app = built.files.get(url.pathname === '/' ? '/index.html' : url.pathname);
      if (app) {
        res.writeHead(200, { 'content-type': app.type, 'content-length': app.contents.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
        res.end(method === 'HEAD' ? undefined : app.contents);
        return;
      }
      if (await servePublic(req, res, url.pathname)) return;
      throw new HttpError(404, 'not found');
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 500) log(`500 ${req.method} ${req.url}: ${error?.stack ?? error}`);
      sendJson(res, status, { error: error?.message ?? String(error), ...(error instanceof HttpError ? error.extra : {}) });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  actualPort = server.address().port;

  const close = async () => {
    await jobs.dispose();
    await new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); });
  };
  return { server, port: actualPort, token, url: `http://127.0.0.1:${actualPort}/?token=${token}`, bundle: built, jobs, close };
}
