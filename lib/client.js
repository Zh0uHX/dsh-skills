window.__ModuleLoader__.load({ id: "dsh-skills", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.tsx
var client_exports = {};
__export(client_exports, {
  SkillsPage: () => SkillsPage,
  apply: () => apply,
  inject: () => inject,
  skillsPageUrl: () => skillsPageUrl
});
module.exports = __toCommonJS(client_exports);
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var API = "/api/dsh-skills";
var PAGE_SIZE = 8;
var RequestError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
};
async function request(path, body, signal) {
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      method: body === void 0 ? "GET" : "POST",
      credentials: "same-origin",
      ...body === void 0 ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
      signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new RequestError("NETWORK_ERROR", "\u65E0\u6CD5\u8FDE\u63A5 DSH\u3002\u8BF7\u786E\u8BA4\u670D\u52A1\u4ECD\u5728\u8FD0\u884C\u540E\u91CD\u8BD5\u3002");
  }
  let value;
  try {
    value = await response.json();
  } catch {
    throw new RequestError("INVALID_RESPONSE", "\u670D\u52A1\u8FD4\u56DE\u4E86\u65E0\u6CD5\u8BFB\u53D6\u7684\u7ED3\u679C\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u540E\u91CD\u8BD5\u3002");
  }
  if (!response.ok) throw new RequestError(value.error?.code ?? "REQUEST_FAILED", value.error?.message ?? `\u8BF7\u6C42\u5931\u8D25\uFF08${response.status}\uFF09\u3002`);
  return value;
}
function errorText(error) {
  return error instanceof Error ? error.message : "\u64CD\u4F5C\u672A\u5B8C\u6210\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002";
}
function ConfirmationDialog({ pending, onCancel, onConfirm }) {
  const dialog = (0, import_react.useRef)(null);
  const cancel = (0, import_react.useRef)(null);
  const removing = pending.operation.kind === "uninstall";
  (0, import_react.useEffect)(() => {
    const element = dialog.current;
    element?.showModal();
    cancel.current?.focus();
    return () => {
      element?.close();
    };
  }, []);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dialog", { className: "dsh-skills-dialog", ref: dialog, "aria-labelledby": "dsh-skills-confirm-title", onCancel, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { id: "dsh-skills-confirm-title", children: removing ? "\u5378\u8F7D\u6280\u80FD" : "\u66FF\u6362\u6280\u80FD\u6587\u4EF6" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-skills-dialog-name", children: pending.operation.skill.name }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: pending.message }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-skills-dialog-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { ref: cancel, type: "button", onClick: onCancel, children: "\u53D6\u6D88" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: removing ? "danger" : "primary", type: "button", onClick: onConfirm, children: removing ? "\u786E\u8BA4\u5378\u8F7D" : "\u786E\u8BA4\u66FF\u6362" })
    ] })
  ] });
}
function SkillMeta({ skill }) {
  const page = skillsPageUrl(skill.url);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-skills-meta", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-skills-source", title: skill.source, children: skill.source }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
      new Intl.NumberFormat("zh-CN").format(skill.installs),
      " \u6B21\u5B89\u88C5"
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { href: page, target: "_blank", rel: "noopener noreferrer", children: "Skills.sh \u2197" })
  ] });
}
function skillsPageUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && ["skills.sh", "www.skills.sh"].includes(url.hostname) && !url.username && !url.password && !url.port) return url.href;
  } catch {
  }
  return "https://www.skills.sh";
}
function ItemNotice({ notice }) {
  return notice ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: `dsh-skills-notice ${notice.kind}`, role: notice.kind === "error" ? "alert" : "status", children: notice.text }) : null;
}
function SkillsPage() {
  const [tab, setTab] = (0, import_react.useState)("search");
  const [draft, setDraft] = (0, import_react.useState)("");
  const [query, setQuery] = (0, import_react.useState)("");
  const [results, setResults] = (0, import_react.useState)(null);
  const [searching, setSearching] = (0, import_react.useState)(false);
  const [searchError, setSearchError] = (0, import_react.useState)("");
  const [page, setPage] = (0, import_react.useState)(1);
  const [installed, setInstalled] = (0, import_react.useState)([]);
  const [root, setRoot] = (0, import_react.useState)("");
  const [loadingInstalled, setLoadingInstalled] = (0, import_react.useState)(true);
  const [installedError, setInstalledError] = (0, import_react.useState)("");
  const [notices, setNotices] = (0, import_react.useState)({});
  const [busy, setBusy] = (0, import_react.useState)({});
  const [checking, setChecking] = (0, import_react.useState)(false);
  const [updates, setUpdates] = (0, import_react.useState)({});
  const [pending, setPending] = (0, import_react.useState)(null);
  const searchRequest = (0, import_react.useRef)(null);
  async function loadInstalled(signal) {
    setLoadingInstalled(true);
    setInstalledError("");
    try {
      const response = await request("/installed", void 0, signal);
      setInstalled(response.skills);
      setRoot(response.root);
    } catch (error) {
      if (!signal?.aborted) setInstalledError(errorText(error));
    } finally {
      if (!signal?.aborted) setLoadingInstalled(false);
    }
  }
  (0, import_react.useEffect)(() => {
    const controller = new AbortController();
    void loadInstalled(controller.signal);
    return () => {
      controller.abort();
      searchRequest.current?.abort();
    };
  }, []);
  async function search(value = draft) {
    const term = value.trim();
    if (term.length < 2) {
      setSearchError("\u8BF7\u8F93\u5165\u81F3\u5C11 2 \u4E2A\u5B57\u7B26\uFF0C\u4F8B\u5982 react \u6216 \u6D4B\u8BD5\u3002");
      return;
    }
    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    setQuery(term);
    setSearching(true);
    setResults(null);
    setSearchError("");
    setPage(1);
    try {
      const response = await request(`/search?q=${encodeURIComponent(term)}`, void 0, controller.signal);
      if (!controller.signal.aborted) setResults(response.skills);
    } catch (error) {
      if (!controller.signal.aborted) setSearchError(errorText(error));
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }
  function submit(event) {
    event.preventDefault();
    void search();
  }
  async function run(operation, confirmed = false) {
    const id = operation.skill.id;
    setBusy((previous) => ({ ...previous, [id]: operation.kind }));
    setNotices((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
    try {
      await request(`/${operation.kind}`, operation.kind === "install" ? { skill: operation.skill, confirmed } : { id, confirmed });
      setNotices((previous) => ({ ...previous, [id]: {
        kind: "success",
        text: operation.kind === "uninstall" ? `\u5DF2\u5378\u8F7D ${operation.skill.name}\u3002` : operation.kind === "update" ? "\u5DF2\u66F4\u65B0\uFF0C\u540E\u7EED\u6280\u80FD\u52A0\u8F7D\u5C06\u4F7F\u7528\u65B0\u6587\u4EF6\u3002" : "\u5B89\u88C5\u5B8C\u6210\uFF0C\u53EF\u5728 DSH \u5BF9\u8BDD\u4E2D\u4F7F\u7528\u3002"
      } }));
      setUpdates((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
      await loadInstalled();
    } catch (error) {
      if (error instanceof RequestError && error.code === "CONFIRMATION_REQUIRED" && !confirmed) {
        setPending({ operation, message: `${error.message} \u66FF\u6362\u5C06\u8986\u76D6\u8BE5\u6280\u80FD\u76EE\u5F55\u4E2D\u7684\u672C\u5730\u4FEE\u6539\u3002` });
      } else setNotices((previous) => ({ ...previous, [id]: { kind: "error", text: errorText(error) } }));
    } finally {
      setBusy((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
    }
  }
  async function checkUpdates() {
    setChecking(true);
    setInstalledError("");
    try {
      const response = await request("/check-updates", {});
      setUpdates(Object.fromEntries(response.updates.map((item) => [item.id, item])));
    } catch (error) {
      setInstalledError(errorText(error));
    } finally {
      setChecking(false);
    }
  }
  const installedIds = new Set(installed.map((item) => item.id));
  const pages = Math.max(1, Math.ceil((results?.length ?? 0) / PAGE_SIZE));
  const visible = results?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const removedNotices = Object.entries(notices).filter(([id, notice]) => notice.kind === "success" && notice.text.startsWith("\u5DF2\u5378\u8F7D") && !installedIds.has(id));
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "dsh-skills", "aria-label": "Skills \u6280\u80FD\u7BA1\u7406", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "dsh-skills-heading", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "Skills" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u641C\u7D22 Skills.sh\uFF0C\u5C06\u6280\u80FD\u5B89\u88C5\u5230\u5F53\u524D DSH \u7684\u7528\u6237\u6280\u80FD\u76EE\u5F55\u3002" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", { className: "dsh-skills-tabs", "aria-label": "\u6280\u80FD\u7BA1\u7406\u89C6\u56FE", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", "aria-pressed": tab === "search", onClick: () => setTab("search"), children: "\u641C\u7D22\u6280\u80FD" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", "aria-pressed": tab === "installed", onClick: () => setTab("installed"), children: [
        "\u5DF2\u5B89\u88C5 ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: installed.length })
      ] })
    ] }),
    tab === "search" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", { className: "dsh-skills-search", onSubmit: submit, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "dsh-skills-sr-only", htmlFor: "dsh-skills-query", children: "\u641C\u7D22\u5173\u952E\u8BCD" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { id: "dsh-skills-query", type: "search", value: draft, maxLength: 100, placeholder: "\u641C\u7D22\u6280\u80FD\uFF0C\u4F8B\u5982 react\u3001code review", onChange: (event) => setDraft(event.target.value), autoComplete: "off" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "primary", type: "submit", disabled: searching, children: searching ? "\u641C\u7D22\u4E2D\u2026" : "\u641C\u7D22" })
      ] }),
      searchError && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-skills-error", role: "alert", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: searchError }),
        query && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => void search(query), children: "\u91CD\u8BD5" })
      ] }),
      searching ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-skills-empty", role: "status", children: "\u6B63\u5728\u8BFB\u53D6 Skills.sh\u2026" }) : results === null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-skills-empty", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "\u4ECE\u4E00\u4E2A\u5173\u952E\u8BCD\u5F00\u59CB" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u53EF\u6309\u5DE5\u5177\u3001\u6846\u67B6\u6216\u4EFB\u52A1\u641C\u7D22\u3002\u5B89\u88C5\u540E\uFF0CDSH \u4F1A\u81EA\u52A8\u53D1\u73B0\u6280\u80FD\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-skills-suggestions", children: ["react", "code review", "testing"].map((term) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => {
          setDraft(term);
          void search(term);
        }, children: term }, term)) })
      ] }) : results.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-skills-empty", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [
          "\u6CA1\u6709\u627E\u5230\u201C",
          query,
          "\u201D\u76F8\u5173\u7684\u6280\u80FD"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u8BD5\u8BD5\u66F4\u77ED\u7684\u5173\u952E\u8BCD\uFF0C\u6216\u4F7F\u7528\u5DE5\u5177\u7684\u82F1\u6587\u540D\u79F0\u3002" })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "dsh-skills-result-count", children: [
          results.length,
          " \u6761\u7ED3\u679C \xB7 \u201C",
          query,
          "\u201D"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-skills-list", children: visible?.map((skill) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", { className: "dsh-skills-item", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-skills-item-header", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: skill.name }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: installedIds.has(skill.id) ? "" : "primary", disabled: Boolean(busy[skill.id]) || loadingInstalled || Boolean(installedError), onClick: () => installedIds.has(skill.id) ? setTab("installed") : void run({ kind: "install", skill }), children: busy[skill.id] ? "\u5B89\u88C5\u4E2D\u2026" : installedIds.has(skill.id) ? "\u5DF2\u5B89\u88C5" : "\u5B89\u88C5" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-skills-description", children: skill.description || "\u6682\u65E0\u7B80\u4ECB\uFF0C\u53EF\u5728 Skills.sh \u67E5\u770B\u8BE6\u60C5\u3002" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SkillMeta, { skill }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ItemNotice, { notice: notices[skill.id] })
        ] }, skill.id)) }),
        pages > 1 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-skills-pagination", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: page === 1, onClick: () => setPage((value) => value - 1), children: "\u4E0A\u4E00\u9875" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
            page,
            " / ",
            pages
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: page === pages, onClick: () => setPage((value) => value + 1), children: "\u4E0B\u4E00\u9875" })
        ] })
      ] }),
      installedError && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-skills-error", role: "alert", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          "\u65E0\u6CD5\u786E\u8BA4\u5DF2\u5B89\u88C5\u72B6\u6001\uFF1A",
          installedError
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => void loadInstalled(), children: "\u91CD\u65B0\u8BFB\u53D6" })
      ] })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-skills-toolbar", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u4EC5\u7BA1\u7406\u901A\u8FC7\u672C\u63D2\u4EF6\u5B89\u88C5\u7684\u6280\u80FD\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: checking || loadingInstalled || installed.length === 0, onClick: () => void checkUpdates(), children: checking ? "\u68C0\u67E5\u4E2D\u2026" : "\u68C0\u67E5\u66F4\u65B0" })
      ] }),
      installedError && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-skills-error", role: "alert", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: installedError }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => void loadInstalled(), children: "\u91CD\u8BD5" })
      ] }),
      removedNotices.map(([id, notice]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ItemNotice, { notice }, id)),
      loadingInstalled ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-skills-empty", role: "status", children: "\u6B63\u5728\u8BFB\u53D6\u5DF2\u5B89\u88C5\u6280\u80FD\u2026" }) : installed.length === 0 && !installedError ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-skills-empty", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "\u8FD8\u6CA1\u6709\u5B89\u88C5\u6280\u80FD" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u641C\u7D22\u5E76\u5B89\u88C5\u4E00\u4E2A\u6280\u80FD\uFF0C\u5B83\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => setTab("search"), children: "\u53BB\u641C\u7D22" })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-skills-list", children: installed.map((item) => {
        const skill = item.skill;
        const update = updates[item.id];
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", { className: "dsh-skills-item", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-skills-item-header", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: skill.name }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-skills-actions", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: Boolean(busy[item.id]) || checking, onClick: () => setPending({ operation: { kind: "update", skill }, message: "\u5C06\u4E0B\u8F7D Skills.sh \u5F53\u524D\u6587\u672C\u5FEB\u7167\uFF0C\u5E76\u66FF\u6362\u6574\u4E2A\u6280\u80FD\u76EE\u5F55\u3002\u76EE\u5F55\u4E2D\u7684\u672C\u5730\u4FEE\u6539\u4F1A\u88AB\u8986\u76D6\u3002" }), children: busy[item.id] === "update" ? "\u66F4\u65B0\u4E2D\u2026" : "\u66F4\u65B0" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "danger-text", disabled: Boolean(busy[item.id]) || checking, onClick: () => setPending({ operation: { kind: "uninstall", skill }, message: "\u5C06\u5220\u9664\u6B64\u6280\u80FD\u76EE\u5F55\u53CA\u5176\u5B89\u88C5\u8BB0\u5F55\u3002\u76EE\u5F55\u4E2D\u7684\u672C\u5730\u4FEE\u6539\u4E5F\u4F1A\u88AB\u5220\u9664\uFF1B\u5176\u4ED6\u6280\u80FD\u4E0D\u53D7\u5F71\u54CD\u3002" }), children: busy[item.id] === "uninstall" ? "\u5378\u8F7D\u4E2D\u2026" : "\u5378\u8F7D" })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-skills-description", children: skill.description || "\u6682\u65E0\u7B80\u4ECB\uFF0C\u53EF\u5728 Skills.sh \u67E5\u770B\u8BE6\u60C5\u3002" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SkillMeta, { skill }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-skills-path", title: item.directory, children: item.directory }),
          item.problem && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-skills-notice error", role: "alert", children: item.problem }),
          update && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: `dsh-skills-update ${update.status}`, role: "status", children: [
            update.status === "available" ? "\u6709\u53EF\u7528\u66F4\u65B0" : update.status === "current" ? "\u5DF2\u662F\u6700\u65B0\u5185\u5BB9" : "\u68C0\u67E5\u5931\u8D25",
            update.message ? ` \xB7 ${update.message}` : ""
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ItemNotice, { notice: notices[item.id] })
        ] }, item.id);
      }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", { className: "dsh-skills-footer", children: [
      root && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u5B89\u88C5\u76EE\u5F55" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: root })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u5FEB\u7167\u4EC5\u542B\u6587\u672C\u6587\u4EF6\uFF1B\u542B\u4E8C\u8FDB\u5236\u8D44\u6E90\u7684\u6280\u80FD\u9700\u53E6\u884C\u6838\u9A8C\u3002" })
    ] }),
    pending && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConfirmationDialog, { pending, onCancel: () => setPending(null), onConfirm: () => {
      const operation = pending.operation;
      setPending(null);
      void run(operation, true);
    } })
  ] });
}
var inject = ["slots"];
function apply(ctx) {
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.dshSkills = "styles";
    style.textContent = `.dsh-skills {
  --sk-text: var(--dsw-alias-label-primary, #25262b);
  --sk-muted: var(--dsw-alias-label-secondary, #76777d);
  --sk-border: var(--dsw-alias-border-l2, #e6e7eb);
  --sk-surface: var(--dsw-alias-bg-layer-2, #fff);
  --sk-subtle: var(--dsw-alias-interactive-bg-hover, #f5f6f8);
  --sk-accent: #4169e1;
  color: var(--sk-text); width: 100%; max-width: 820px; font-size: 14px;
  line-height: 1.55; text-align: left; box-sizing: border-box;
}
.dsh-skills *, .dsh-skills-dialog * { box-sizing: border-box; }
.dsh-skills button, .dsh-skills input, .dsh-skills-dialog button { font: inherit; }
.dsh-skills button, .dsh-skills-dialog button {
  border: 1px solid var(--sk-border, #e6e7eb); border-radius: 7px;
  color: inherit; background: transparent; padding: 7px 13px; cursor: pointer;
  white-space: nowrap; line-height: 1.4; transition: background .12s ease;
}
.dsh-skills button:hover:not(:disabled), .dsh-skills-dialog button:hover { background: var(--sk-subtle, #f5f6f8); }
.dsh-skills button:disabled { cursor: default; opacity: .5; }
.dsh-skills button:focus-visible, .dsh-skills input:focus-visible, .dsh-skills a:focus-visible, .dsh-skills-dialog button:focus-visible {
  outline: 2px solid var(--sk-accent, #4169e1); outline-offset: 3px;
}
.dsh-skills .primary, .dsh-skills-dialog .primary { color: #fff; background: #4169e1; border-color: #4169e1; }
.dsh-skills .primary:hover:not(:disabled), .dsh-skills-dialog .primary:hover { background: #3459c7; }
.dsh-skills-heading h2 { margin: 0 0 5px; font-size: 21px; font-weight: 600; letter-spacing: -.4px; }
.dsh-skills-heading p, .dsh-skills-toolbar p { margin: 0; color: var(--sk-muted); }
.dsh-skills-tabs { display: flex; gap: 22px; border-bottom: 1px solid var(--sk-border); margin: 22px 0 20px; }
.dsh-skills-tabs button { border: 0; border-radius: 0; padding: 9px 0 12px; color: var(--sk-muted); position: relative; }
.dsh-skills-tabs button[aria-pressed="true"] { color: var(--sk-text); font-weight: 600; }
.dsh-skills-tabs button[aria-pressed="true"]::after { content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 2px; background: var(--sk-text); }
.dsh-skills-tabs button span { font-size: 12px; color: var(--sk-muted); background: var(--sk-subtle); padding: 1px 5px; border-radius: 4px; margin-left: 3px; }
.dsh-skills-search { display: flex; gap: 9px; }
.dsh-skills-search input { flex: 1; min-width: 0; border: 1px solid var(--sk-border); color: var(--sk-text); background: var(--sk-surface); border-radius: 8px; padding: 10px 12px; outline: none; }
.dsh-skills-search input::placeholder { color: var(--sk-muted); }
.dsh-skills-search input:focus { border-color: var(--sk-accent); }
.dsh-skills-search button { min-width: 76px; }
.dsh-skills-result-count { font-size: 12px; color: var(--sk-muted); margin: 18px 0 2px; }
.dsh-skills-list { display: flex; flex-direction: column; }
.dsh-skills-item { padding: 20px 0; border-bottom: 1px solid var(--sk-border); }
.dsh-skills-item-header { display: flex; align-items: start; justify-content: space-between; gap: 15px; }
.dsh-skills-item h3 { font-size: 15px; line-height: 1.5; font-weight: 600; margin: 2px 0 0; overflow-wrap: anywhere; }
.dsh-skills-description { color: var(--sk-muted); margin: 8px 0 10px; font-size: 13px; overflow-wrap: anywhere; }
.dsh-skills-meta { display: flex; flex-wrap: wrap; gap: 5px 16px; font-size: 12px; color: var(--sk-muted); }
.dsh-skills-source { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
.dsh-skills-meta a { color: var(--sk-muted); text-decoration: none; }
.dsh-skills-meta a:hover { color: var(--sk-accent); text-decoration: underline; }
.dsh-skills-empty { padding: 50px 20px; text-align: center; color: var(--sk-muted); font-size: 13px; }
.dsh-skills-empty strong { display: block; font-size: 14px; font-weight: 500; color: var(--sk-text); }
.dsh-skills-empty p { margin: 8px 0 16px; }
.dsh-skills-suggestions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
.dsh-skills-suggestions button { font-size: 12px; padding: 5px 10px; }
.dsh-skills-pagination { display: flex; align-items: center; justify-content: flex-end; gap: 14px; margin-top: 16px; font-size: 12px; color: var(--sk-muted); }
.dsh-skills-pagination button { padding: 5px 10px; }
.dsh-skills-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.dsh-skills-toolbar p { font-size: 12px; }
.dsh-skills-actions { display: flex; gap: 7px; }
.dsh-skills .danger-text { color: #b54141; }
.dsh-skills-path { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: var(--sk-muted); overflow-wrap: anywhere; margin: 10px 0 0; }
.dsh-skills-notice, .dsh-skills-update { font-size: 12px; margin: 10px 0 0; overflow-wrap: anywhere; }
.dsh-skills-notice.success, .dsh-skills-update.current { color: #2c7c55; }
.dsh-skills-notice.error, .dsh-skills-update.error { color: #bb4141; }
.dsh-skills-update.available { color: var(--sk-accent); }
.dsh-skills-error { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 11px 13px; border: 1px solid #e8c2c2; border-radius: 7px; margin-top: 14px; color: #b44141; font-size: 12px; }
.dsh-skills-error button { flex-shrink: 0; }
.dsh-skills-footer { margin-top: 22px; font-size: 11px; color: var(--sk-muted); display: flex; flex-direction: column; gap: 3px; }
.dsh-skills-footer code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
.dsh-skills-footer p { margin: 8px 0 0; }
.dsh-skills-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
.dsh-skills-dialog { width: min(440px, calc(100vw - 32px)); border: 1px solid var(--sk-border, #e6e7eb); background: var(--sk-surface, white); color: var(--sk-text, #25262b); border-radius: 12px; padding: 25px; box-shadow: 0 16px 70px #0003; font: inherit; font-size: 14px; line-height: 1.6; }
.dsh-skills-dialog::backdrop { background: #0005; }
.dsh-skills-dialog h3 { margin: 0 0 14px; font-size: 18px; font-weight: 600; }
.dsh-skills-dialog p { color: var(--sk-muted, #76777d); margin: 8px 0 0; }
.dsh-skills-dialog .dsh-skills-dialog-name { color: var(--sk-text, #25262b); font-weight: 500; overflow-wrap: anywhere; }
.dsh-skills-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; }
.dsh-skills-dialog .danger { background: #b54141; border-color: #b54141; color: white; }
.dsh-skills-dialog .danger:hover { background: #993434; }
body[data-ds-dark-theme] .dsh-skills { --sk-text: #e5e5e8; --sk-muted: #9c9da7; --sk-border: #393a41; --sk-surface: #25262b; --sk-subtle: #303137; }
@media (max-width: 520px) {
  .dsh-skills-item-header { gap: 8px; }
  .dsh-skills-actions { gap: 5px; }
  .dsh-skills-actions button { padding: 6px 8px; }
  .dsh-skills-meta { gap: 5px 10px; }
  .dsh-skills-toolbar { align-items: start; }
}
`;
    document.head.append(style);
    return () => {
      style.remove();
    };
  }, "dsh-skills: styles");
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "dsh-skills",
    order: 45,
    label: "Skills"
  }, SkillsPage));
}
return module.exports; } });
