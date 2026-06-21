import { useState, useRef } from "react";

export const useLoading = () => {
  const [states, setStates] = useState({});
  const is   = k => !!states[k];
  const wrap = (k, fn) => async (...args) => {
    setStates(s => ({ ...s, [k]: true }));
    try { return await fn(...args); }
    finally { setStates(s => ({ ...s, [k]: false })); }
  };
  return { is, wrap };
};

export const useToasts = () => {
  const [list, setList] = useState([]);
  const add = (message, type = 'success') => {
    const id = Date.now() + Math.random();
    setList(t => [...t.slice(-4), { id, message, type }]);
    setTimeout(() => setList(t => t.filter(x => x.id !== id)), 4500);
  };
  return { list, success: m => add(m, 'success'), error: m => add(m, 'error'), warn: m => add(m, 'warn') };
};

export const useConfirm = () => {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);
  const confirm = opts => new Promise(res => { resolveRef.current = res; setState(opts); });
  const ok  = () => { setState(null); resolveRef.current?.(true); };
  const nok = () => { setState(null); resolveRef.current?.(false); };
  return { confirm, state, ok, nok };
};
