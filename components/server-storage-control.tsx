'use client';
import {useEffect,useState} from 'react';
import {publishedJournal} from '@/lib/publication';
import {authorizeDevice,storageStatus,serverAuthorization} from '@/lib/server-storage';
export function ServerStorageControl({kind,compact=false}:{kind:'journal'|'joys';compact?:boolean}){
  const [status,setStatus]=useState(()=>storageStatus(kind)),[token,setToken]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{
    if(!publishedJournal)return;
    const update=()=>setStatus(storageStatus(kind));
    window.addEventListener('love-journal-server-status',update);
    void serverAuthorization().then(update).catch(cause=>setError(cause.message));update();
    return ()=>window.removeEventListener('love-journal-server-status',update);
  },[kind]);
  if(!publishedJournal)return null;
  const labels={checking:'正在连接服务器…',local:'仅保存在此设备 · 尚未授权',saving:'正在存入服务器…',synced:status.authorized?'已存入服务器 · 自动保存已启用':'服务器内容 · 此设备未授权编辑',pending:'本机已保留 · 服务器尚未保存',conflict:'版本冲突 · 本机内容已保留'};
  if(compact)return <span role="status">{labels[status.phase]}</span>;
  return <div className="help" style={{margin:'12px 0'}}>
    <p role="status">{labels[status.phase]}{status.detail ? '：'+status.detail : ''}</p>
    {!status.authorized && <>
      <p>输入一次性设备授权码后，这台设备的后续保存会自动存入服务器。授权码由网站维护者签发，请勿分享给其他人。</p>
      <input aria-label="一次性设备授权码" type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value.trim())} />
      <button type="button" disabled={busy||!token} onClick={async()=>{setBusy(true);setError('');try{await authorizeDevice(token);setToken('');location.reload();}catch(cause){setError((cause as Error).message);setBusy(false);}}}>{busy?'正在授权…':'授权此设备'}</button>
    </>}
    {status.phase==='pending' && <button type="button" onClick={()=>location.reload()}>重新连接并重试上传</button>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
