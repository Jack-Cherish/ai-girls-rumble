// Optional local inference. Read the model list only after an explicit player action.
window.ArenaLocalProvider = (() => {
  const origin = 'http://127.0.0.1:11434';
  const status = document.getElementById('localStatus');
  let active = null, revision = 0, generation = null;
  const setStatus = text => { if (status) status.textContent = text; };

  async function request(path, body, controller, timeout) {
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(origin + path, {
        method: body === undefined ? 'GET' : 'POST', credentials: 'omit', redirect: 'error',
        referrerPolicy: 'no-referrer', cache: 'no-store', signal: controller.signal,
        ...(body === undefined ? {} : {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)})
      });
      if (!response.ok) throw new Error('Ollama 返回 HTTP ' + response.status + '。请检查本机服务和模型。');
      return await response.json();
    } catch (e) {
      if (controller.signal.aborted) throw new Error('本地请求已取消或超时。');
      if (e instanceof TypeError) throw new Error('无法连接本机 Ollama。请检查服务、浏览器的本地网络权限和 OLLAMA_ORIGINS。');
      throw e;
    } finally { clearTimeout(timer); }
  }

  function localEntry(entry) {
    return typeof entry?.name === 'string' && entry.name.length > 0 &&
      !entry.remote_model && !entry.remote_host && !/(?:^|[-:/])cloud(?:$|[-:/])/i.test(entry.name);
  }
  async function list() {
    const data = await request('/api/tags', undefined, new AbortController(), 7000);
    if (!Array.isArray(data.models)) throw new Error('未识别 Ollama 的模型列表。');
    return [...new Set(data.models.filter(localEntry).map(entry => entry.name))];
  }
  function cancel() { generation?.abort(); generation = null; }
  function detach() {
    revision++; cancel(); active = null; setStatus('本地 AI · 未接入');
  }
  async function attach(adapter) {
    detach();
    const version = revision;
    if (typeof adapter?.probe !== 'function') throw new TypeError('适配器缺少 probe()');
    const info = await adapter.probe();
    if (version !== revision || info?.ok !== true) return false;
    active = adapter;
    setStatus('本地 AI · 已连接' + (info.model ? ' / ' + info.model : ''));
    return true;
  }
  function select(model) {
    return attach({
      model,
      async probe() {
        if (!(await list()).includes(model)) throw new Error('该模型未安装在此设备上，请刷新列表。');
        const meta = await request('/api/show', {model}, new AbortController(), 10000);
        if (!meta.details?.format || meta.remote_model || meta.remote_host ||
            (Array.isArray(meta.capabilities) && !meta.capabilities.includes('completion'))) {
          throw new Error('请选择支持文本生成、权重位于本机的模型。');
        }
        return {ok: true, model};
      },
      async generate(input, task) {
        const designer = window.DormDesigner;
        const prompt = (task === 'description' ? designer.makeDescriptionPrompt : designer.makePrompt)(input);
        cancel();
        const controller = generation = new AbortController();
        const start = performance.now();
        const version = revision;
        try {
          const data = await request('/api/chat', {
            model, stream: false, format: 'json', messages: [{role: 'user', content: prompt}]
          }, controller, 180000);
          if (version !== revision || generation !== controller || controller.signal.aborted) throw new Error('已取消此次生成。');
          const parsed = (task === 'description' ? designer.parseDescription : designer.parseGenerated)(data.message?.content, input.index);
          setStatus('本地 AI · ' + model + ' / 本次请求 ' + ((performance.now() - start) / 1000).toFixed(2) + ' 秒');
          return parsed;
        } finally { if (generation === controller) generation = null; }
      }
    });
  }

  if (status?.insertAdjacentElement) {
    const panel = document.createElement('details');
    panel.innerHTML = '<summary>使用本机 Ollama 改招</summary><p>先在这台电脑启动 Ollama 并准备文本模型。连接后，上方两步生成将把角色文字发送至本机模型。</p><button class="secondary" type="button" data-action="refresh">读取本机模型</button><label>已安装模型<select disabled></select></label><button class="primary" type="button" data-action="connect" disabled>连接此模型</button> <button class="secondary" type="button" data-action="off">断开本地模型</button>';
    status.insertAdjacentElement('afterend', panel);
    const models = panel.querySelector('select');
    const refresh = panel.querySelector('[data-action=refresh]');
    const connect = panel.querySelector('[data-action=connect]');
    const off = panel.querySelector('[data-action=off]');
    let attempt = 0;
    refresh.onclick = async () => {
      const current = ++attempt; detach(); models.replaceChildren();
      refresh.disabled = models.disabled = connect.disabled = true;
      setStatus('正在读取本机模型列表…');
      try {
        const entries = await list();
        if (attempt !== current) return;
        for (const name of entries) models.add(new Option(name, name));
        models.disabled = connect.disabled = entries.length === 0;
        setStatus(entries.length ? '请选择模型并连接。' : '未发现已安装的本机模型。');
      } catch (e) { if (attempt === current) setStatus(e.message); }
      finally { if (attempt === current) refresh.disabled = false; }
    };
    connect.onclick = async () => {
      const current = ++attempt; connect.disabled = models.disabled = true;
      try { await select(models.value); }
      catch (e) { if (attempt === current) setStatus(e.message); }
      finally { if (attempt === current) connect.disabled = models.disabled = models.length === 0; }
    };
    models.onchange = () => detach();
    off.onclick = () => { ++attempt; detach(); refresh.disabled = false; models.disabled = connect.disabled = models.length === 0; };
  }

  return Object.freeze({attach, detach, cancel, list, select, get current() { return active; }});
})();
