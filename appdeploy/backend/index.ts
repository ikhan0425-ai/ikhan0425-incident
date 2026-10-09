// 그림터 백엔드 (AppDeploy). 모든 라우트는 JSON 을 주고받고, 오류는 { error, code } 로 응답한다.

import { db, json, requireAuth, router, storage, type RouterContext } from '@appdeploy/sdk';
import { createHash, randomUUID } from 'node:crypto';
import { LIMITS, PAGE_SIZE } from './shared/constants';
import { parseImageFilters, parseModelFilters, parsePage, periodStart } from './shared/filters';
import type { ModelOption, Profile } from './shared/types';
import { byteSize, previewOf, searchOf, type ImageSummary, type ModelSummary } from './lib/catalog';
import { badRequest, bodyOf, forbidden, handle, notFound, optionalUser, userOf } from './lib/http';
import { isSeedId, seedProfileNames } from './lib/seed';
import {
  imageDetail,
  imageLikes,
  likesTable,
  loadWorld,
  modelDetail,
  modelDownloads,
  modelLikes,
  profileOf,
  profileTable,
  resolveUrls,
  toImageCards,
  toModelCards,
  viewerLikes,
  type ImageRecord,
  type ModelRecord,
  type ProfileRecord,
  type VersionRecord,
  type World,
} from './lib/service';
import {
  decodeBase64,
  MIME,
  parseDisplayName,
  parseImages,
  parseModel,
  parseVersion,
  safeFileName,
  sniffImage,
  type ValidImage,
  type ValidVersion,
} from './lib/validate';

const lower = (s: string) => s.toLocaleLowerCase('ko-KR');

function q(ctx: RouterContext, key: string): string {
  const v = ctx.query?.[key];
  return typeof v === 'string' ? v : '';
}

// ---------------------------------------------------------------------------
// 공통 도우미
// ---------------------------------------------------------------------------

/**
 * 같은 Lambda 인스턴스 안에서의 간단한 빈도 제한 (인스턴스가 여러 개면 각각 따로 센다).
 * 다운로드 수 부풀리기와 업로드 남용을 줄이는 용도라 완벽하지 않아도 된다.
 */
const hits = new Map<string, number[]>();
function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return true;
}

function clientIp(ctx: RouterContext): string {
  const e = ctx.event as
    | { requestContext?: { http?: { sourceIp?: string } }; headers?: Record<string, string> }
    | undefined;
  return e?.requestContext?.http?.sourceIp ?? e?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ?? 'unknown';
}

const NICK_A = ['푸른', '새벽', '조용한', '반짝이는', '느긋한', '용감한', '포근한', '은빛', '노을빛', '말랑한'];
const NICK_B = ['붓', '물감', '캔버스', '고양이', '여우', '고래', '별', '구름', '연필', '팔레트'];

/** 첫 로그인 닉네임. 계정의 실명·이메일을 공개하지 않도록 무작위로 만든다 (프로필에서 바꿀 수 있다) */
function randomNickname(userId: string): string {
  let h = 0;
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `${NICK_A[h % NICK_A.length]} ${NICK_B[(h >>> 8) % NICK_B.length]} ${String(h % 10000).padStart(4, '0')}`;
}

/** 클라이언트가 보낸 모델 파일 정보(크기·해시)를 믿지 않고 저장된 파일로 다시 계산한다 */
async function verifyModelFile(v: ValidVersion): Promise<ValidVersion> {
  if (!v.file) return v;
  const [stored] = await storage.read([v.file.path]);
  if (!stored?.content) throw badRequest('모델 파일을 다시 올려 주세요.');
  const buf = Buffer.from(stored.content, 'base64');
  return { ...v, file: { ...v.file, size: buf.length, sha256: createHash('sha256').update(buf).digest('hex') } };
}

/** 이미 다른 게시물에 쓰인 업로드 경로는 다시 쓸 수 없다 */
function assertFreshUploads(w: World, images: ValidImage[]): void {
  const used = new Set(w.images.map((i) => i.thumb));
  if (images.some((img) => used.has(img.thumbPath))) throw badRequest('이미지를 다시 올려 주세요.');
}

/** likes:<userId> 테이블에서 조건에 맞는 기록 찾기 (filter 는 읽은 뒤 적용되므로 페이지를 따라간다) */
async function findLike(table: string, kind: 'm' | 'i', target: string) {
  let nextToken: string | undefined;
  for (let page = 0; page < 20; page++) {
    const res = await db.list<{ k: string; target: string; at: number }>(table, {
      filter: { k: kind, target },
      limit: 500,
      nextToken,
    });
    const found = res.items.find((x) => x.k === kind && x.target === target);
    if (found || !res.nextToken) return found ?? null;
    nextToken = res.nextToken;
  }
  return null;
}

/** 로그인 사용자의 프로필 (없으면 AppDeploy 계정 이름으로 만든다) */
async function ensureProfile(ctx: RouterContext): Promise<{ id: string | null; rec: ProfileRecord }> {
  const user = userOf(ctx);
  const existing = await profileOf(user.userId);
  if (existing) return existing;
  const rec: ProfileRecord = { displayName: randomNickname(user.userId), bio: '', createdAt: Date.now() };
  const [id] = await db.add(profileTable(user.userId), [rec as unknown as Record<string, unknown>]);
  return { id, rec };
}

function imageRecordOf(
  userId: string,
  img: ValidImage,
  modelId: string | null,
  versionId: string | null,
  at: number,
): ImageRecord {
  return {
    ownerId: userId,
    modelId,
    versionId,
    file: img.path,
    thumb: img.thumbPath,
    width: img.width,
    height: img.height,
    color: img.color,
    meta: img.meta,
    source: img.source,
    nsfw: img.nsfw,
    createdAt: at,
  };
}

function imageSummaryOf(id: string, rec: ImageRecord, ownerName: string): ImageSummary {
  return {
    id,
    ownerId: rec.ownerId,
    ownerName,
    modelId: rec.modelId,
    versionId: rec.versionId,
    thumb: rec.thumb,
    width: rec.width,
    height: rec.height,
    color: rec.color,
    nsfw: rec.nsfw,
    createdAt: rec.createdAt,
    meta: previewOf(rec.meta),
    source: rec.source,
    ...(searchOf(rec.meta.prompt) ? { search: searchOf(rec.meta.prompt) } : {}),
  };
}

/** 이미지 레코드 저장 + 카탈로그 요약 추가 (save 는 호출한 쪽에서) */
async function insertImages(
  w: World,
  userId: string,
  ownerName: string,
  images: ValidImage[],
  link: (img: ValidImage) => { modelId: string | null; versionId: string | null },
  now: number,
): Promise<string[]> {
  if (!images.length) return [];
  const records = images.map((img, i) => {
    const { modelId, versionId } = link(img);
    return imageRecordOf(userId, img, modelId, versionId, now + i);
  });
  const ids = await db.add('images', records as unknown as Record<string, unknown>[]);
  ids.forEach((id, i) => {
    if (!id) throw new Error('image insert failed');
    w.cat.putImage(imageSummaryOf(id, records[i], ownerName));
  });
  return ids as string[];
}

function versionRecordOf(v: ValidVersion, now: number): VersionRecord {
  return {
    id: randomUUID(),
    name: v.name,
    baseModel: v.baseModel,
    triggerWords: v.triggerWords,
    description: v.description,
    externalUrl: v.externalUrl,
    file: v.file,
    createdAt: now,
  };
}

function summaryOf(id: string, rec: ModelRecord): ModelSummary {
  return {
    id,
    ownerId: rec.ownerId,
    ownerName: rec.ownerName,
    name: rec.name,
    type: rec.type,
    nsfw: rec.nsfw,
    tags: rec.tags,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    versions: rec.versions
      .map((v) => ({
        id: v.id,
        name: v.name,
        baseModel: v.baseModel,
        sha10: v.file?.sha256.slice(0, 10) ?? null,
        createdAt: v.createdAt,
      }))
      .sort((a, b) => a.createdAt - b.createdAt),
  };
}

/** 이미지 레코드·파일 삭제 (DB 호출당 500개 제한에 맞춰 나눈다. 이미 없는 것은 건너뛴다) */
async function deleteStoredImages(ids: string[]): Promise<void> {
  const userIds = ids.filter((id) => !isSeedId(id));
  for (let i = 0; i < userIds.length; i += 500) {
    const part = userIds.slice(i, i + 500);
    const recs = await db.get<ImageRecord>('images', part);
    const paths = recs.flatMap((r) => (r ? [r.file, r.thumb] : [])).filter((p) => p.startsWith('u/'));
    for (let j = 0; j < paths.length; j += 100) await storage.delete(paths.slice(j, j + 100));
    await db.delete('images', part);
  }
}

/**
 * 좋아요 설정. 기록은 likes:<userId> 테이블에 { k: 'm'|'i', target, at } (id 는 DB 가 붙이는 레코드 ID 라 쓰지 않는다).
 * desired 를 주면 그 상태로 맞추고(여러 번 눌러도 같은 결과), 없으면 뒤집는다.
 * changed 가 false 면 이미 그 상태였던 것이라 집계를 바꾸지 않는다.
 */
async function setLike(
  userId: string,
  kind: 'm' | 'i',
  target: string,
  desired: boolean | undefined,
): Promise<{ liked: boolean; changed: boolean; at: number }> {
  const table = likesTable(userId);
  const existing = await findLike(table, kind, target);
  const want = desired ?? !existing;
  if (existing && !want) {
    await db.delete(table, [existing.id]);
    return { liked: false, changed: true, at: existing.at ?? Date.now() };
  }
  if (!existing && want) {
    const at = Date.now();
    await db.add(table, [{ k: kind, target, at }]);
    return { liked: true, changed: true, at };
  }
  return { liked: want, changed: false, at: Date.now() };
}

function desiredLike(ctx: RouterContext): boolean | undefined {
  const v = bodyOf(ctx).liked;
  return typeof v === 'boolean' ? v : undefined;
}

/** 모델 레코드 하나가 DB 레코드 한도(256KiB)를 넘지 않게 */
const MAX_VERSIONS = 50;
function assertModelRecordSize(rec: ModelRecord): void {
  if (rec.versions.length > MAX_VERSIONS) throw badRequest(`버전은 ${MAX_VERSIONS}개까지 올릴 수 있어요.`);
  if (byteSize(rec) > 230 * 1024) throw badRequest('모델 정보가 너무 커요. 설명이나 버전 메모를 줄여 주세요.');
}

// ---------------------------------------------------------------------------
// 라우트
// ---------------------------------------------------------------------------

export const handler = router({
  'GET /api/_healthcheck': [async () => json({ message: 'Success' })],

  // 모델 목록 (카테고리·베이스 모델·태그 필터, 정렬·기간, 검색)
  'GET /api/models': [
    handle(async (ctx) => {
      const f = parseModelFilters(ctx.query ?? {});
      const page = parsePage(ctx.query ?? {});
      const userId = q(ctx, 'userId');
      const w = await loadWorld();
      const since = periodStart(f.period, w.now);
      const needle = lower(f.q);

      let list = w.models.filter((m) => {
        if (userId && m.ownerId !== userId) return false;
        if (f.types.length && !f.types.includes(m.type)) return false;
        if (f.baseModels.length && !m.versions.some((v) => f.baseModels.includes(v.baseModel))) return false;
        if (f.tags.some((t) => !m.tags.includes(t))) return false;
        if (needle) {
          const hay = [m.name, m.ownerName, ...m.tags].map(lower);
          if (!hay.some((h) => h.includes(needle))) return false;
        }
        if (f.sort === 'newest' && since && m.createdAt < since) return false;
        return true;
      });
      if (f.sort === 'newest') {
        list.sort((a, b) => b.createdAt - a.createdAt);
      } else {
        const score = new Map(
          list.map((m) => [
            m.id,
            f.sort === 'downloads' ? modelDownloads(w, m.id, f.period) : modelLikes(w, m.id, f.period),
          ]),
        );
        list.sort((a, b) => score.get(b.id)! - score.get(a.id)! || b.createdAt - a.createdAt);
      }
      const start = (page - 1) * PAGE_SIZE;
      const hasMore = list.length > start + PAGE_SIZE;
      list = list.slice(start, start + PAGE_SIZE);
      const items = await toModelCards(w, list);

      let tags: { name: string; count: number }[] | undefined;
      if (page === 1) {
        const counts = new Map<string, number>();
        for (const m of w.models) for (const t of m.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
        tags = [...counts.entries()]
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
          .slice(0, 40);
      }
      return json({ items, hasMore, ...(tags ? { tags } : {}) });
    }),
  ],

  'GET /api/models/:id': [
    handle(async (ctx) => {
      const viewer = await optionalUser(ctx);
      const [w, liked] = await Promise.all([loadWorld(), viewerLikes(viewer?.userId ?? null)]);
      const detail = await modelDetail(w, ctx.params.id, liked);
      if (!detail) throw notFound('모델을 찾을 수 없어요.');
      const { files: _files, ...model } = detail;
      void _files;
      return json({ model });
    }),
  ],

  // 모델 업로드: 모델 정보 + 첫 버전 + 샘플 이미지
  'POST /api/models': [
    requireAuth(),
    handle(async (ctx) => {
      const user = userOf(ctx);
      const body = bodyOf(ctx);
      const model = parseModel(body);
      const images = parseImages(body.images, user.userId, model.nsfw, true);
      const version = await verifyModelFile(parseVersion(body.version, user.userId));
      const profile = await ensureProfile(ctx);
      assertFreshUploads(await loadWorld(), images);
      const now = Date.now();
      const v = versionRecordOf(version, now);
      const rec: ModelRecord = {
        ownerId: user.userId,
        ownerName: profile.rec.displayName,
        ...model,
        createdAt: now,
        updatedAt: now,
        versions: [v],
      };
      assertModelRecordSize(rec);
      const [id] = await db.add('models', [rec as unknown as Record<string, unknown>]);
      if (!id) throw new Error('model insert failed');
      const w = await loadWorld();
      w.cat.putModel(summaryOf(id, rec));
      await insertImages(
        w,
        user.userId,
        profile.rec.displayName,
        images,
        () => ({ modelId: id, versionId: v.id }),
        now,
      );
      await w.cat.save();
      return json({ id, versionId: v.id });
    }),
  ],

  // 모델 삭제: 제작자 샘플 이미지·파일은 지우고, 다른 사람 이미지는 연결만 끊는다
  'DELETE /api/models/:id': [
    requireAuth(),
    handle(async (ctx) => {
      const user = userOf(ctx);
      const id = ctx.params.id;
      const w = await loadWorld();
      const m = w.modelById.get(id);
      if (!m) throw notFound('모델을 찾을 수 없어요.');
      if (isSeedId(id) || m.ownerId !== user.userId) throw forbidden('모델 제작자만 삭제할 수 있어요.');

      const related = w.imagesByModel.get(id) ?? [];
      const own = related.filter((i) => i.ownerId === user.userId).map((i) => i.id);
      const others = related.filter((i) => i.ownerId !== user.userId);
      // 1) 카탈로그에서 먼저 지운다 (목록·검색의 기준). 다른 사람 이미지는 연결만 끊는다.
      for (const imgId of own) w.cat.removeImage(imgId);
      for (const img of others) w.cat.putImage({ ...img, modelId: null, versionId: null });
      w.cat.removeModel(id);
      await w.cat.save();
      // 2) 그다음 실제 레코드와 파일. 중간에 실패해도 화면에 남는 유령 항목은 없다.
      const [rec] = await db.get<ModelRecord>('models', [id]);
      await deleteStoredImages(own);
      const files = (rec?.versions ?? []).flatMap((v) => (v.file ? [v.file.path] : []));
      if (files.length) await storage.delete(files);
      await db.delete('models', [id]);
      return json({ ok: true });
    }),
  ],

  'POST /api/models/:id/like': [
    requireAuth(),
    handle(async (ctx) => {
      const user = userOf(ctx);
      const id = ctx.params.id;
      const w = await loadWorld();
      if (!w.modelById.has(id)) throw notFound('모델을 찾을 수 없어요.');
      const { liked, changed, at } = await setLike(user.userId, 'm', id, desiredLike(ctx));
      if (changed) {
        w.cat.bumpModel(id, 'lk', at, liked ? 1 : -1);
        await w.cat.save();
      }
      return json({ liked, likes: modelLikes(w, id) });
    }),
  ],

  // 새 버전 추가 (제작자만)
  'POST /api/models/:id/versions': [
    requireAuth(),
    handle(async (ctx) => {
      const user = userOf(ctx);
      const id = ctx.params.id;
      if (isSeedId(id)) throw forbidden('샘플 모델에는 버전을 추가할 수 없어요.');
      const body = bodyOf(ctx);
      const [rec] = await db.get<ModelRecord>('models', [id]);
      if (!rec) throw notFound('모델을 찾을 수 없어요.');
      if (rec.ownerId !== user.userId) throw forbidden('모델 제작자만 버전을 추가할 수 있어요.');
      const parsed = parseVersion(body.version, user.userId);
      if (rec.versions.some((v) => v.name === parsed.name)) throw badRequest('같은 이름의 버전이 이미 있어요.');
      const images = parseImages(body.images, user.userId, rec.nsfw, true);
      const version = await verifyModelFile(parsed);
      const profile = await ensureProfile(ctx);
      const w = await loadWorld();
      assertFreshUploads(w, images);
      const now = Date.now();
      const v = versionRecordOf(version, now);
      // 닉네임을 바꿨을 수 있으므로 현재 프로필 이름을 쓴다
      const ownerName = profile.rec.displayName;
      const next: ModelRecord = { ...rec, ownerName, versions: [...rec.versions, v], updatedAt: now };
      assertModelRecordSize(next);
      const [ok] = await db.update('models', [{ id, record: next as unknown as Record<string, unknown> }]);
      if (!ok) throw new Error('model update failed');
      w.cat.putModel(summaryOf(id, next));
      await insertImages(w, user.userId, ownerName, images, () => ({ modelId: id, versionId: v.id }), now);
      await w.cat.save();
      return json({ id, versionId: v.id });
    }),
  ],

  // 다운로드: 집계 후 받을 주소를 돌려준다
  'GET /api/models/:id/versions/:versionId/download': [
    handle(async (ctx) => {
      const { id, versionId } = ctx.params;
      const w = await loadWorld();
      const detail = await modelDetail(w, id, new Set());
      const file = detail?.files.get(versionId);
      if (!detail || !file || !file.path) throw notFound('파일을 찾을 수 없어요.');
      // 같은 사람이 짧은 시간에 반복해서 받으면 다운로드 수에 넣지 않는다
      if (
        allow(`dl:${clientIp(ctx)}:${versionId}`, 1, 10 * 60 * 1000) &&
        allow(`dl:${clientIp(ctx)}`, 30, 60 * 60 * 1000)
      ) {
        // 집계에 실패해도 다운로드는 막지 않는다
        try {
          w.cat.bumpModel(id, 'dl', w.now, 1, versionId);
          await w.cat.save();
        } catch (e) {
          console.warn('[download] stats not saved', e);
        }
      }
      if (file.external) return json({ url: file.path, external: true });
      const urls = await resolveUrls([file.path]);
      return json({ url: urls.get(file.path) ?? file.path, external: false });
    }),
  ],

  // 이미지 올리기 폼의 "사용한 모델" 검색
  'GET /api/model-options': [
    handle(async (ctx) => {
      const w = await loadWorld();
      const toOption = (m: ModelSummary): ModelOption => ({
        id: m.id,
        name: m.name,
        type: m.type,
        versions: [...m.versions].reverse().map((v) => ({ id: v.id, name: v.name, baseModel: v.baseModel })),
      });
      const modelId = q(ctx, 'modelId');
      if (modelId) {
        const m = w.modelById.get(modelId);
        return json({ items: m ? [toOption(m)] : [] });
      }
      const needle = lower(q(ctx, 'q').trim().slice(0, 100));
      const items = w.models
        .filter((m) => !needle || lower(m.name).includes(needle))
        .sort((a, b) => modelDownloads(w, b.id) - modelDownloads(w, a.id))
        .slice(0, 10)
        .map(toOption);
      return json({ items });
    }),
  ],

  // 이미지 목록 (피드, 모델 갤러리, 프로필)
  'GET /api/images': [
    handle(async (ctx) => {
      const query = ctx.query ?? {};
      const f = parseImageFilters(query);
      const page = parsePage(query);
      const pageSize = Math.min(60, Math.max(1, Number.parseInt(q(ctx, 'pageSize'), 10) || PAGE_SIZE));
      const modelId = q(ctx, 'modelId');
      const versionId = q(ctx, 'versionId');
      const userId = q(ctx, 'userId');
      const excludeUserId = q(ctx, 'excludeUserId');
      const oldestFirst = q(ctx, 'oldestFirst') === '1';
      const viewer = await optionalUser(ctx);
      const [w, liked] = await Promise.all([loadWorld(), viewerLikes(viewer?.userId ?? null)]);
      const since = periodStart(f.period, w.now);
      const needle = lower(f.q);

      let list = w.images.filter((img) => {
        if (modelId && img.modelId !== modelId) return false;
        if (versionId && img.versionId !== versionId) return false;
        if (userId && img.ownerId !== userId) return false;
        if (excludeUserId && img.ownerId === excludeUserId) return false;
        if (needle) {
          const modelName = img.modelId ? (w.modelById.get(img.modelId)?.name ?? '') : '';
          const prompt = img.search ?? lower(img.meta.prompt ?? '');
          if (!prompt.includes(needle) && !lower(modelName).includes(needle)) return false;
        }
        if (f.sort !== 'likes' && since && img.createdAt < since) return false;
        return true;
      });
      if (oldestFirst) list.sort((a, b) => a.createdAt - b.createdAt);
      else if (f.sort === 'likes') {
        const score = new Map(list.map((i) => [i.id, imageLikes(w, i.id, f.period)]));
        list.sort((a, b) => score.get(b.id)! - score.get(a.id)! || b.createdAt - a.createdAt);
      } else list.sort((a, b) => b.createdAt - a.createdAt);

      const start = (page - 1) * pageSize;
      const hasMore = list.length > start + pageSize;
      list = list.slice(start, start + pageSize);
      return json({ items: await toImageCards(w, list, liked), hasMore });
    }),
  ],

  'GET /api/images/:id': [
    handle(async (ctx) => {
      const viewer = await optionalUser(ctx);
      const [w, liked] = await Promise.all([loadWorld(), viewerLikes(viewer?.userId ?? null)]);
      const image = await imageDetail(w, ctx.params.id, liked);
      if (!image) throw notFound('이미지를 찾을 수 없어요.');
      return json({ image });
    }),
  ],

  // 이미지 게시. 모델을 고르지 않았으면 이미지의 Model hash 로 등록된 체크포인트를 찾아 연결한다
  'POST /api/images': [
    requireAuth(),
    handle(async (ctx) => {
      const user = userOf(ctx);
      const body = bodyOf(ctx);
      const images = parseImages(body.images, user.userId, false, true);
      const modelId = typeof body.modelId === 'string' && body.modelId ? body.modelId : null;
      const versionId = typeof body.versionId === 'string' && body.versionId ? body.versionId : null;
      const profile = await ensureProfile(ctx);
      const w = await loadWorld();
      assertFreshUploads(w, images);
      let fixed: { modelId: string; versionId: string } | null = null;
      if (modelId) {
        const m = w.modelById.get(modelId);
        const v = m?.versions.find((x) => x.id === versionId) ?? m?.versions[m.versions.length - 1];
        if (!m || !v) throw badRequest('선택한 모델 버전을 찾을 수 없어요.');
        fixed = { modelId: m.id, versionId: v.id };
      }
      const byHash = (hash: string | null) => {
        const h = hash?.toLowerCase();
        if (!h || !/^[0-9a-f]{8,64}$/.test(h)) return null;
        for (const m of w.models) {
          for (const v of m.versions) {
            if (v.sha10 && (v.sha10.startsWith(h.slice(0, 10)) || h.startsWith(v.sha10)))
              return { modelId: m.id, versionId: v.id };
          }
        }
        return null;
      };
      const ids = await insertImages(
        w,
        user.userId,
        profile.rec.displayName,
        images,
        (img) => fixed ?? byHash(img.meta.modelHash) ?? { modelId: null, versionId: null },
        Date.now(),
      );
      await w.cat.save();
      return json({ ids });
    }),
  ],

  'DELETE /api/images/:id': [
    requireAuth(),
    handle(async (ctx) => {
      const user = userOf(ctx);
      const id = ctx.params.id;
      const w = await loadWorld();
      const img = w.imageById.get(id);
      if (!img) throw notFound('이미지를 찾을 수 없어요.');
      if (isSeedId(id) || img.ownerId !== user.userId) throw forbidden('올린 사람만 삭제할 수 있어요.');
      await deleteStoredImages([id]);
      w.cat.removeImage(id);
      await w.cat.save();
      return json({ ok: true });
    }),
  ],

  'POST /api/images/:id/like': [
    requireAuth(),
    handle(async (ctx) => {
      const user = userOf(ctx);
      const id = ctx.params.id;
      const w = await loadWorld();
      if (!w.imageById.has(id)) throw notFound('이미지를 찾을 수 없어요.');
      const { liked, changed, at } = await setLike(user.userId, 'i', id, desiredLike(ctx));
      if (changed) {
        w.cat.bumpImage(id, at, liked ? 1 : -1);
        await w.cat.save();
      }
      return json({ liked, likes: imageLikes(w, id) });
    }),
  ],

  // 파일 업로드 (base64). 이미지는 원본 + 썸네일, 모델 파일은 작은 파일(임베딩, 워크플로)만
  'POST /api/uploads': [
    requireAuth(),
    handle(async (ctx) => {
      const user = userOf(ctx);
      if (!allow(`up:${user.userId}`, 120, 60 * 60 * 1000)) {
        throw badRequest('업로드가 너무 많아요. 잠시 후 다시 시도해 주세요.');
      }
      const body = bodyOf(ctx);
      if (body.kind === 'image') {
        const original = decodeBase64(body.data, LIMITS.uploadBytes, '이미지');
        const kind = sniffImage(original);
        if (!kind) throw badRequest('PNG, JPEG, WebP 이미지만 올릴 수 있어요.');
        const thumb = decodeBase64(body.thumb, 1024 * 1024, '썸네일');
        const thumbKind = sniffImage(thumb);
        if (thumbKind !== 'webp' && thumbKind !== 'jpg') throw badRequest('썸네일 형식이 올바르지 않아요.');
        const name = randomUUID();
        const path = `u/${user.userId}/i/${name}.${kind}`;
        const thumbPath = `u/${user.userId}/i/${name}-t.${thumbKind}`;
        const ok = await storage.write([
          { path, content: original.toString('base64'), contentType: MIME[kind] },
          { path: thumbPath, content: thumb.toString('base64'), contentType: MIME[thumbKind] },
        ]);
        if (ok.some((x) => !x)) throw new Error('storage write failed');
        return json({ path, thumbPath });
      }
      if (body.kind === 'model') {
        const fileName = safeFileName(body.fileName);
        const data = decodeBase64(body.data, LIMITS.uploadBytes, '모델');
        const path = `u/${user.userId}/f/${randomUUID()}/${fileName}`;
        // .json 워크플로도 브라우저에서 열리지 않고 내려받아지도록 항상 octet-stream
        const contentType = 'application/octet-stream';
        const [ok] = await storage.write([{ path, content: data.toString('base64'), contentType }]);
        if (!ok) throw new Error('storage write failed');
        return json({ path, size: data.length, sha256: createHash('sha256').update(data).digest('hex') });
      }
      throw badRequest('알 수 없는 업로드 종류예요.');
    }),
  ],

  'GET /api/me': [
    requireAuth(),
    handle(async (ctx) => {
      const user = userOf(ctx);
      const profile = await ensureProfile(ctx);
      return json({ me: { id: user.userId, displayName: profile.rec.displayName } });
    }),
  ],

  // 닉네임 변경: 프로필과 내가 올린 모델·이미지의 표시 이름을 함께 바꾼다
  'PUT /api/me': [
    requireAuth(),
    handle(async (ctx) => {
      const user = userOf(ctx);
      const displayName = parseDisplayName(bodyOf(ctx).displayName, seedProfileNames());
      const profile = await ensureProfile(ctx);
      const next: ProfileRecord = { ...profile.rec, displayName };
      if (profile.id)
        await db.update(profileTable(user.userId), [
          { id: profile.id, record: next as unknown as Record<string, unknown> },
        ]);
      const w = await loadWorld();
      for (const m of w.cat.models.values())
        if (m.ownerId === user.userId) w.cat.putModel({ ...m, ownerName: displayName });
      for (const i of w.cat.images.values())
        if (i.ownerId === user.userId) w.cat.putImage({ ...i, ownerName: displayName });
      await w.cat.save();
      return json({ me: { id: user.userId, displayName } });
    }),
  ],

  'GET /api/users/:id': [
    handle(async (ctx) => {
      const id = ctx.params.id;
      const w = await loadWorld();
      const models = w.models.filter((m) => m.ownerId === id);
      const images = w.images.filter((i) => i.ownerId === id);
      const found = await profileOf(id);
      if (!found && !models.length && !images.length) throw notFound('사용자를 찾을 수 없어요.');
      const name = found?.rec.displayName ?? models[0]?.ownerName ?? images[0]?.ownerName ?? '그림터 사용자';
      const createdAt = found?.rec.createdAt ?? Math.min(...[...models, ...images].map((x) => x.createdAt));
      const profile: Profile = {
        id,
        displayName: name,
        bio: found?.rec.bio ?? '',
        createdAt,
        stats: {
          models: models.length,
          images: images.length,
          downloads: models.reduce((s, m) => s + modelDownloads(w, m.id), 0),
          likes:
            models.reduce((s, m) => s + modelLikes(w, m.id), 0) + images.reduce((s, i) => s + imageLikes(w, i.id), 0),
        },
      };
      return json({ profile });
    }),
  ],
});
