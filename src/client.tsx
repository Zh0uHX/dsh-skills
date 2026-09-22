import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type { CatalogSkill, InstalledSkill, UpdateCheck } from './types.js';

declare const __DSH_SKILLS_STYLES__: string;
const API = '/api/dsh-skills';
const PAGE_SIZE = 8;
type Notice = { kind: 'success' | 'error'; text: string };
type Operation = { kind: 'install'; skill: CatalogSkill } | { kind: 'update' | 'uninstall'; skill: CatalogSkill };
type Confirmation = { operation: Operation; message: string };

class RequestError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new RequestError('NETWORK_ERROR', '无法连接 DSH。请确认服务仍在运行后重试。');
  }
  let value: any;
  try { value = await response.json(); }
  catch { throw new RequestError('INVALID_RESPONSE', '服务返回了无法读取的结果，请刷新页面后重试。'); }
  if (!response.ok) throw new RequestError(value.error?.code ?? 'REQUEST_FAILED', value.error?.message ?? `请求失败（${response.status}）。`);
  return value as T;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '操作未完成，请稍后重试。';
}

function ConfirmationDialog({ pending, onCancel, onConfirm }: {
  pending: Confirmation; onCancel: () => void; onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const removing = pending.operation.kind === 'uninstall';
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    cancel.current?.focus();
    return () => { element?.close(); };
  }, []);
  return <dialog className="dsh-skills-dialog" ref={dialog} aria-labelledby="dsh-skills-confirm-title" onCancel={onCancel}>
    <h3 id="dsh-skills-confirm-title">{removing ? '卸载技能' : '替换技能文件'}</h3>
    <p className="dsh-skills-dialog-name">{pending.operation.skill.name}</p>
    <p>{pending.message}</p>
    <div className="dsh-skills-dialog-actions">
      <button ref={cancel} type="button" onClick={onCancel}>取消</button>
      <button className={removing ? 'danger' : 'primary'} type="button" onClick={onConfirm}>{removing ? '确认卸载' : '确认替换'}</button>
    </div>
  </dialog>;
}

function SkillMeta({ skill }: { skill: CatalogSkill }) {
  const page = skillsPageUrl(skill.url);
  return <div className="dsh-skills-meta">
    <span className="dsh-skills-source" title={skill.source}>{skill.source}</span>
    <span>{new Intl.NumberFormat('zh-CN').format(skill.installs)} 次安装</span>
    <a href={page} target="_blank" rel="noopener noreferrer">Skills.sh ↗</a>
  </div>;
}

export function skillsPageUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && ['skills.sh', 'www.skills.sh'].includes(url.hostname) && !url.username && !url.password && !url.port) return url.href;
  } catch { /* A damaged local record must never create an executable link. */ }
  return 'https://www.skills.sh';
}

function ItemNotice({ notice }: { notice: Notice | undefined }) {
  return notice ? <p className={`dsh-skills-notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</p> : null;
}

export function SkillsPage() {
  const [tab, setTab] = useState<'search' | 'installed'>('search');
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogSkill[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [page, setPage] = useState(1);
  const [installed, setInstalled] = useState<InstalledSkill[]>([]);
  const [root, setRoot] = useState('');
  const [loadingInstalled, setLoadingInstalled] = useState(true);
  const [installedError, setInstalledError] = useState('');
  const [notices, setNotices] = useState<Record<string, Notice>>({});
  const [busy, setBusy] = useState<Record<string, Operation['kind']>>({});
  const [checking, setChecking] = useState(false);
  const [updates, setUpdates] = useState<Record<string, UpdateCheck>>({});
  const [pending, setPending] = useState<Confirmation | null>(null);
  const searchRequest = useRef<AbortController | null>(null);

  async function loadInstalled(signal?: AbortSignal) {
    setLoadingInstalled(true);
    setInstalledError('');
    try {
      const response = await request<{ skills: InstalledSkill[]; root: string }>('/installed', undefined, signal);
      setInstalled(response.skills);
      setRoot(response.root);
    } catch (error) {
      if (!signal?.aborted) setInstalledError(errorText(error));
    } finally { if (!signal?.aborted) setLoadingInstalled(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadInstalled(controller.signal);
    return () => { controller.abort(); searchRequest.current?.abort(); };
  }, []);

  async function search(value = draft) {
    const term = value.trim();
    if (term.length < 2) { setSearchError('请输入至少 2 个字符，例如 react 或 测试。'); return; }
    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    setQuery(term);
    setSearching(true);
    setResults(null);
    setSearchError('');
    setPage(1);
    try {
      const response = await request<{ skills: CatalogSkill[] }>(`/search?q=${encodeURIComponent(term)}`, undefined, controller.signal);
      if (!controller.signal.aborted) setResults(response.skills);
    } catch (error) {
      if (!controller.signal.aborted) setSearchError(errorText(error));
    } finally { if (!controller.signal.aborted) setSearching(false); }
  }

  function submit(event: FormEvent) { event.preventDefault(); void search(); }

  async function run(operation: Operation, confirmed = false) {
    const id = operation.skill.id;
    setBusy(previous => ({ ...previous, [id]: operation.kind }));
    setNotices(previous => { const next = { ...previous }; delete next[id]; return next; });
    try {
      await request(`/${operation.kind}`, operation.kind === 'install'
        ? { skill: operation.skill, confirmed }
        : { id, confirmed });
      setNotices(previous => ({ ...previous, [id]: {
        kind: 'success', text: operation.kind === 'uninstall' ? `已卸载 ${operation.skill.name}。` : operation.kind === 'update' ? '已更新，后续技能加载将使用新文件。' : '安装完成，可在 DSH 对话中使用。',
      } }));
      setUpdates(previous => { const next = { ...previous }; delete next[id]; return next; });
      await loadInstalled();
    } catch (error) {
      if (error instanceof RequestError && error.code === 'CONFIRMATION_REQUIRED' && !confirmed) {
        setPending({ operation, message: `${error.message} 替换将覆盖该技能目录中的本地修改。` });
      } else setNotices(previous => ({ ...previous, [id]: { kind: 'error', text: errorText(error) } }));
    } finally {
      setBusy(previous => { const next = { ...previous }; delete next[id]; return next; });
    }
  }

  async function checkUpdates() {
    setChecking(true);
    setInstalledError('');
    try {
      const response = await request<{ updates: UpdateCheck[] }>('/check-updates', {});
      setUpdates(Object.fromEntries(response.updates.map(item => [item.id, item])));
    } catch (error) { setInstalledError(errorText(error)); }
    finally { setChecking(false); }
  }

  const installedIds = new Set(installed.map(item => item.id));
  const pages = Math.max(1, Math.ceil((results?.length ?? 0) / PAGE_SIZE));
  const visible = results?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const removedNotices = Object.entries(notices).filter(([id, notice]) => notice.kind === 'success' && notice.text.startsWith('已卸载') && !installedIds.has(id));

  return <section className="dsh-skills" aria-label="Skills 技能管理">
    <header className="dsh-skills-heading"><h2>Skills</h2><p>搜索 Skills.sh，将技能安装到当前 DSH 的用户技能目录。</p></header>
    <nav className="dsh-skills-tabs" aria-label="技能管理视图">
      <button type="button" aria-pressed={tab === 'search'} onClick={() => setTab('search')}>搜索技能</button>
      <button type="button" aria-pressed={tab === 'installed'} onClick={() => setTab('installed')}>已安装 <span>{installed.length}</span></button>
    </nav>

    {tab === 'search' ? <div>
      <form className="dsh-skills-search" onSubmit={submit}>
        <label className="dsh-skills-sr-only" htmlFor="dsh-skills-query">搜索关键词</label>
        <input id="dsh-skills-query" type="search" value={draft} maxLength={100} placeholder="搜索技能，例如 react、code review" onChange={event => setDraft(event.target.value)} autoComplete="off" />
        <button className="primary" type="submit" disabled={searching}>{searching ? '搜索中…' : '搜索'}</button>
      </form>
      {searchError && <div className="dsh-skills-error" role="alert"><span>{searchError}</span>{query && <button type="button" onClick={() => void search(query)}>重试</button>}</div>}
      {searching ? <p className="dsh-skills-empty" role="status">正在读取 Skills.sh…</p> : results === null ? <div className="dsh-skills-empty"><strong>从一个关键词开始</strong><p>可按工具、框架或任务搜索。安装后，DSH 会自动发现技能。</p><div className="dsh-skills-suggestions">{['react', 'code review', 'testing'].map(term => <button type="button" key={term} onClick={() => { setDraft(term); void search(term); }}>{term}</button>)}</div></div> : results.length === 0 ? <div className="dsh-skills-empty"><strong>没有找到“{query}”相关的技能</strong><p>试试更短的关键词，或使用工具的英文名称。</p></div> : <>
        <p className="dsh-skills-result-count">{results.length} 条结果 · “{query}”</p>
        <div className="dsh-skills-list">{visible?.map(skill => <article className="dsh-skills-item" key={skill.id}>
          <div className="dsh-skills-item-header"><h3>{skill.name}</h3><button type="button" className={installedIds.has(skill.id) ? '' : 'primary'} disabled={Boolean(busy[skill.id]) || loadingInstalled || Boolean(installedError)} onClick={() => installedIds.has(skill.id) ? setTab('installed') : void run({ kind: 'install', skill })}>{busy[skill.id] ? '安装中…' : installedIds.has(skill.id) ? '已安装' : '安装'}</button></div>
          <p className="dsh-skills-description">{skill.description || '暂无简介，可在 Skills.sh 查看详情。'}</p>
          <SkillMeta skill={skill} /><ItemNotice notice={notices[skill.id]} />
        </article>)}</div>
        {pages > 1 && <div className="dsh-skills-pagination"><button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>上一页</button><span>{page} / {pages}</span><button type="button" disabled={page === pages} onClick={() => setPage(value => value + 1)}>下一页</button></div>}
      </>}
      {installedError && <div className="dsh-skills-error" role="alert"><span>无法确认已安装状态：{installedError}</span><button type="button" onClick={() => void loadInstalled()}>重新读取</button></div>}
    </div> : <div>
      <div className="dsh-skills-toolbar"><p>仅管理通过本插件安装的技能。</p><button type="button" disabled={checking || loadingInstalled || installed.length === 0} onClick={() => void checkUpdates()}>{checking ? '检查中…' : '检查更新'}</button></div>
      {installedError && <div className="dsh-skills-error" role="alert"><span>{installedError}</span><button type="button" onClick={() => void loadInstalled()}>重试</button></div>}
      {removedNotices.map(([id, notice]) => <ItemNotice key={id} notice={notice} />)}
      {loadingInstalled ? <p className="dsh-skills-empty" role="status">正在读取已安装技能…</p> : installed.length === 0 && !installedError ? <div className="dsh-skills-empty"><strong>还没有安装技能</strong><p>搜索并安装一个技能，它会出现在这里。</p><button type="button" onClick={() => setTab('search')}>去搜索</button></div> : <div className="dsh-skills-list">{installed.map(item => {
        const skill = item.skill;
        const update = updates[item.id];
        return <article className="dsh-skills-item" key={item.id}>
          <div className="dsh-skills-item-header"><h3>{skill.name}</h3><div className="dsh-skills-actions">
            <button type="button" disabled={Boolean(busy[item.id]) || checking} onClick={() => setPending({ operation: { kind: 'update', skill }, message: '将下载 Skills.sh 当前文本快照，并替换整个技能目录。目录中的本地修改会被覆盖。' })}>{busy[item.id] === 'update' ? '更新中…' : '更新'}</button>
            <button type="button" className="danger-text" disabled={Boolean(busy[item.id]) || checking} onClick={() => setPending({ operation: { kind: 'uninstall', skill }, message: '将删除此技能目录及其安装记录。目录中的本地修改也会被删除；其他技能不受影响。' })}>{busy[item.id] === 'uninstall' ? '卸载中…' : '卸载'}</button>
          </div></div>
          <p className="dsh-skills-description">{skill.description || '暂无简介，可在 Skills.sh 查看详情。'}</p><SkillMeta skill={skill} />
          <p className="dsh-skills-path" title={item.directory}>{item.directory}</p>
          {item.problem && <p className="dsh-skills-notice error" role="alert">{item.problem}</p>}
          {update && <p className={`dsh-skills-update ${update.status}`} role="status">{update.status === 'available' ? '有可用更新' : update.status === 'current' ? '已是最新内容' : '检查失败'}{update.message ? ` · ${update.message}` : ''}</p>}
          <ItemNotice notice={notices[item.id]} />
        </article>;
      })}</div>}
    </div>}
    <footer className="dsh-skills-footer">{root && <><span>安装目录</span><code>{root}</code></>}<p>快照仅含文本文件；含二进制资源的技能需另行核验。</p></footer>
    {pending && <ConfirmationDialog pending={pending} onCancel={() => setPending(null)} onConfirm={() => { const operation = pending.operation; setPending(null); void run(operation, true); }} />}
  </section>;
}

export const inject = ['slots'];
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const style = document.createElement('style');
    style.dataset.dshSkills = 'styles';
    style.textContent = __DSH_SKILLS_STYLES__;
    document.head.append(style);
    return () => { style.remove(); };
  }, 'dsh-skills: styles');
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'dsh-skills', order: 45, label: 'Skills',
  }, SkillsPage));
}
