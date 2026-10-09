import { useEffect, useRef, useState } from 'react';
import { ArrowUp, BookOpen, File, Folder, GitBranch, GitFork, Image, Laptop, Plus, Puzzle, Settings, ShieldCheck, X } from 'lucide-react';
import { api } from '../api';

const FILE_LIMIT = 2 * 1024 * 1024;
const TOTAL_LIMIT = 8 * 1024 * 1024;
const readFile = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
  reader.readAsDataURL(file);
});

export function SupervisorComposer({ objective, setObjective, projectId, setProjectId, repositoryPath, setRepositoryPath,
  projects, branch, setBranch, context, setContext, canStart, busy, assignment }) {
  const [panel, setPanel] = useState('');
  const [catalog, setCatalog] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [project, setProject] = useState(null);
  const [checkedPath, setCheckedPath] = useState('');
  const fileInput = useRef(null);
  const mediaInput = useRef(null);
  const root = useRef(null);
  const revision = useRef(0);

  useEffect(() => {
    revision.current += 1;
    setProject(null); setCheckedPath(''); setBranch(''); setChecking(false);
  }, [repositoryPath, setBranch]);

  useEffect(() => {
    if (!panel) return;
    const close = event => { if (!root.current?.contains(event.target)) setPanel(''); };
    const escape = event => { if (event.key === 'Escape') { setPanel(''); root.current?.querySelector(`[data-panel="${panel}"]`)?.focus(); } };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [panel]);

  async function inspect() {
    const current = ++revision.current;
    setChecking(true); setError('');
    const result = await api('/api/supervisor/project', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ repositoryPath: repositoryPath.trim() }), maxRetries: 0 });
    if (current !== revision.current) return;
    setChecking(false);
    if (result.error) { setProject(null); setCheckedPath(''); setError(String(result.error)); return; }
    setProject(result); setCheckedPath(repositoryPath); setBranch(result.branch || ''); setPanel('');
  }

  async function openCatalog(kind) {
    setPanel(kind); setSearch(''); setError('');
    if (catalog) return;
    const result = await api('/api/supervisor/context');
    if (result.error) setError(String(result.error));
    else setCatalog(result.items || []);
  }

  async function attach(files, kind) {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    setReading(true); setError('');
    try {
      if (context.length + selected.length > 12 || selected.some(file => file.size > FILE_LIMIT) || [...context, ...selected].reduce((sum, item) => sum + item.size, 0) > TOTAL_LIMIT) throw new Error('Use at most 12 items, 2 MB per file and 8 MB total.');
      const additions = await Promise.all(selected.map(async file => ({ id: crypto.randomUUID(), kind, name: file.name, size: file.size, type: file.type, data: await readFile(file) })));
      setContext(previous => [...previous, ...additions]); setPanel('');
    } catch (failure) { setError(failure.message); }
    finally { setReading(false); if (fileInput.current) fileInput.current.value = ''; if (mediaInput.current) mediaInput.current.value = ''; }
  }

  function addReference(item) {
    if (context.some(entry => entry.catalogId === item.id)) return;
    if (context.length >= 12 || context.reduce((sum, entry) => sum + entry.size, item.size) > TOTAL_LIMIT) { setError('Attachment limit reached. Remove an item first.'); return; }
    setContext(previous => [...previous, { id: item.id, catalogId: item.id, kind: item.kind, name: item.name, size: item.size }]);
    setPanel('');
  }

  const toggle = value => { setPanel(panel === value ? '' : value); setError(''); };
  const projectName = repositoryPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'Choose project';
  const validProject = project && checkedPath === repositoryPath;
  return <div className="sup-chat" ref={root}>
    <div className="sup-chat-root">
      <button type="button" data-panel="project" aria-expanded={panel === 'project'} onClick={() => toggle('project')} title={repositoryPath || 'Choose project root'}><Folder size={20} /><span>{projectName}</span></button>
      <span className="sup-chat-host"><Laptop size={20} /> This computer</span>
      <button className="sup-chat-settings" type="button" data-panel="environment" aria-label="Configure local environment" aria-expanded={panel === 'environment'} onClick={() => toggle('environment')}><Settings size={20} /></button>
    </div>
    {panel === 'project' && <div className="sup-chat-popover sup-project-picker">
      <h3>Project root</h3>
      <label>Saved projects<select value={projectId} onChange={event => { const id = event.target.value; setProjectId(id); setRepositoryPath(projects.find(item => item.id === id)?.repositoryPath || ''); }}><option value="">Choose a local repository</option>{projects.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label>Root folder<input value={repositoryPath} onChange={event => { setRepositoryPath(event.target.value); setProjectId(''); }} placeholder="C:\\Projects\\my-project" spellCheck={false} autoComplete="off" /></label>
      <button type="button" className="btn" disabled={checking || !repositoryPath.trim()} onClick={inspect}>{checking ? 'Checking…' : 'Use project'}</button>
    </div>}
    {panel === 'environment' && <div className="sup-chat-popover sup-environment">
      <h3>Configure local environment</h3>
      <div className="sup-environment-row"><GitFork size={19} /><span>New worktree</span><input aria-label="New worktree required" type="checkbox" role="switch" checked disabled /></div>
      <p>Supervisor keeps every worker in an isolated worktree.</p>
      <label className="sup-environment-row"><GitBranch size={19} /><span>Branch</span><select aria-label="Starting branch" value={branch} disabled={!validProject} onChange={event => setBranch(event.target.value)}><option value="">{validProject ? 'Current HEAD' : 'Choose project first'}</option>{(project?.branches || []).map(name => <option key={name}>{name}</option>)}</select></label>
      <div className="sup-environment-row"><Settings size={19} /><span>Environment</span><span>Local</span></div>
    </div>}
    <div className="sup-chat-box">
      <label className="sr-only" htmlFor="sup-objective">What should the agents accomplish?</label>
      <textarea id="sup-objective" rows={3} required maxLength={12000} value={objective} onChange={event => setObjective(event.target.value)} placeholder="Do anything" />
      {context.length > 0 && <ul className="sup-context-chips" aria-label="Task attachments">{context.map(item => <li key={item.id}>
        {item.kind === 'media' ? <img src={`data:${item.type};base64,${item.data}`} alt="" /> : item.kind === 'skill' ? <BookOpen size={16} /> : item.kind === 'plugin' ? <Puzzle size={16} /> : <File size={16} />}
        <span title={item.name}>{item.name}<small>{item.kind === 'plugin' || item.kind === 'skill' ? 'Reference' : `${Math.ceil(item.size / 1024)} KB`}</small></span>
        <button type="button" aria-label={`Remove ${item.name}`} disabled={reading} onClick={() => setContext(previous => previous.filter(entry => entry.id !== item.id))}><X size={14} /></button>
      </li>)}</ul>}
      <div className="sup-chat-bottom">
        <button type="button" className="sup-add-button" data-panel="add" aria-label="Add media, files, plugins or skills" aria-expanded={['add', 'plugin', 'skill'].includes(panel)} disabled={reading} onClick={() => toggle('add')}><Plus size={24} /></button>
        <span className="sup-chat-permission"><ShieldCheck size={17} /> Worktree access</span>
        <span className="sup-chat-assignment">{assignment}</span>
        <button type="submit" className="sup-chat-send" aria-label="Start task" title={!validProject ? 'Choose and verify a project root first' : project.dirty ? 'Preserve uncommitted changes before starting' : 'Start task'} disabled={!canStart || !objective.trim() || !validProject || project.dirty || reading || checking}><ArrowUp size={23} /></button>
      </div>
      {panel === 'add' && <div className="sup-chat-popover sup-add-menu">
        <button type="button" onClick={() => mediaInput.current?.click()}><Image size={18} /> Add media <small>PNG, JPEG, WebP</small></button>
        <button type="button" onClick={() => fileInput.current?.click()}><File size={18} /> Add file</button>
        <button type="button" onClick={() => openCatalog('plugin')}><Puzzle size={18} /> Add plugin</button>
        <button type="button" onClick={() => openCatalog('skill')}><BookOpen size={18} /> Add skill</button>
      </div>}
      {['plugin', 'skill'].includes(panel) && <div className="sup-chat-popover sup-context-picker">
        <div className="sup-row"><h3>Add {panel}</h3><button type="button" aria-label="Close picker" onClick={() => setPanel('')}><X size={16} /></button></div>
        <p>Local reference documents. Tools and hooks stay disabled.</p>
        <input aria-label={`Search ${panel}s`} placeholder={`Search ${panel}s`} value={search} onChange={event => setSearch(event.target.value)} />
        <div className="sup-context-results">{catalog === null ? <p>{error ? 'Could not load local references.' : 'Loading local references…'}</p> : <>
          {catalog.filter(item => item.kind === panel && item.name.toLowerCase().includes(search.toLowerCase())).map(item => <button type="button" key={item.id} title={item.path} disabled={context.some(entry => entry.catalogId === item.id)} onClick={() => addReference(item)}>{item.name}<small>{context.some(entry => entry.catalogId === item.id) ? 'Added' : item.path}</small></button>)}
          {!catalog.some(item => item.kind === panel && item.name.toLowerCase().includes(search.toLowerCase())) && <p>No matching local {panel}s.</p>}
        </>}</div>
      </div>}
    </div>
    <input ref={mediaInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={event => attach(event.target.files, 'media')} />
    <input ref={fileInput} type="file" multiple hidden onChange={event => attach(event.target.files, 'file')} />
    <div aria-live="polite" className="sup-chat-feedback">{error ? <p role="alert" className="sup-warning">{error}</p> : reading ? 'Reading attachments…' : busy === 'create' ? 'Creating task…' : validProject ? `${branch || 'HEAD'} · ${project.dirty ? 'Uncommitted changes must be preserved before starting' : 'Project ready'}` : 'Choose a project root to begin.'}</div>
  </div>;
}
