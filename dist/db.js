const DB='dama-local-v1';let connection;
export async function openDB(){if(connection)return connection;connection=await new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{req.result.createObjectStore('items',{keyPath:'id'});req.result.createObjectStore('meta',{keyPath:'key'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});return connection;}
async function tx(store,mode,action){const db=await openDB();return new Promise((resolve,reject)=>{const t=db.transaction(store,mode),s=t.objectStore(store);let req;try{req=action(s);}catch(e){reject(e);return;}t.oncomplete=()=>resolve(req?.result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('저장이 중단됐어요.'));});}
export const allItems=()=>tx('items','readonly',s=>s.getAll());
export const putItem=item=>tx('items','readwrite',s=>s.put(item));
export const removeItem=id=>tx('items','readwrite',s=>s.delete(id));
export const setMeta=(key,value)=>tx('meta','readwrite',s=>s.put({key,value}));
export const getMeta=async key=>(await tx('meta','readonly',s=>s.get(key)))?.value;
export async function putMany(items){const db=await openDB();await new Promise((resolve,reject)=>{const t=db.transaction('items','readwrite');items.forEach(i=>t.objectStore('items').put(i));t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}
